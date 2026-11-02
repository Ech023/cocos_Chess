import { _decorator, Component, Node, UITransform, view, Graphics, Color, Label, BlockInputEvents } from "cc";
import { Chess } from "./chessCore/chess";
import { ChessBoardView } from "./ChessBoardView";
import { ChessAI, AIDifficulty } from "./ChessAI";

const { ccclass } = _decorator;

@ccclass("ChessGame")
export class ChessGame extends Component {
	private chess!: Chess;
	private boardView!: ChessBoardView;
	private boardNode!: Node;

	private ai!: ChessAI;
	private globalSum: number = 0;
	private isAIMode: boolean = true;

	private moveHistory: string[] = [];
	private initialFen: string = new Chess().fen();

	private modeButtons: Node[] = [];
	private currentModeIndex: number = 2; // 默认选中中级

	start() {
		this.chess = new Chess();
		this.initialFen = this.chess.fen();

		// 1. 创建棋盘节点
		this.boardNode = new Node("ChessBoard");
		this.boardNode.layer = this.node.layer;
		this.boardNode.parent = this.node;
		this.boardNode.addComponent(UITransform).setContentSize(940, 940);

		this.boardView = this.boardNode.addComponent(ChessBoardView);
		this.boardView.init(this.chess);

		// 2. AI 绑定
		this.ai = new ChessAI(this.chess, AIDifficulty.MEDIUM);
		this.boardView.onMoveSuccess = () => {
			const history = this.chess.history({ verbose: true });
			if (history.length > 0) {
				const lastMove = history[history.length - 1];
				this.globalSum = this.ai.evaluateBoard(lastMove, this.globalSum, "b");
			}
		};
		this.boardView.onGameOver = msg => this.showGameOverUI(msg);
		this.boardView.onAIMoveAsync = () => {
			if (!this.isAIMode) return Promise.resolve(null);
			return this.ai.getBestMoveAsync(this.chess.turn(), this.globalSum);
		};

		// 3. 创建按钮占位节点
		this.createModeButtons();

		// 4. 首次执行布局自适应，并监听窗口变化
		this.updateLayout();
		view.on("canvas-resize", this.updateLayout, this);
	}

	onDestroy() {
		view.off("canvas-resize", this.updateLayout, this);
	}

	/**
	 * 核心自适应布局逻辑
	 */
	private updateLayout() {
		const visibleSize = view.getVisibleSize();
		const screenW = visibleSize.width;
		const screenH = visibleSize.height;

		// ================= 1. 棋盘自适应 =================
		const boardBaseSize = 940;

		// 留出顶部 HUD (胜率条和AI状态，约 200px) 和 底部按钮空间 (约 100px)
		const usableHeight = screenH - 300;

		// 计算宽、高对应的缩放比例
		const scaleW = (screenW * 0.95) / boardBaseSize;
		const scaleH = (usableHeight > 300 ? usableHeight : 300) / boardBaseSize; // 给最小高度保底
		const finalScale = Math.min(scaleW, scaleH);

		this.boardNode.setScale(finalScale, finalScale, 1);

		// 让棋盘居中，稍微向上偏移一点给底部留出视觉空间
		this.boardNode.setPosition(0, 20, 0);

		// ================= 2. 底部按钮自适应 =================
		const count = this.modeButtons.length;
		const marginX = 20; // 屏幕左右边距
		const gapX = 8; // 按钮间距
		const availableWidth = screenW - marginX * 2;

		// 动态计算每个按钮的宽度
		const btnWidth = (availableWidth - gapX * (count - 1)) / count;
		const btnHeight = Math.min(btnWidth * 0.8, 56); // 按钮高度随宽度自适应，最高56

		// 计算 Y 坐标：屏幕底部往上 30px
		const btnY = -screenH / 2 + btnHeight / 2 + 30;
		const startX = -availableWidth / 2 + btnWidth / 2;

		this.modeButtons.forEach((btn, index) => {
			// 更新尺寸和位置
			btn.getComponent(UITransform)!.setContentSize(btnWidth, btnHeight);
			btn.setPosition(startX + index * (btnWidth + gapX), btnY, 0);

			// 重绘背景
			const g = btn.getComponent(Graphics)!;
			g.clear();
			g.fillColor = index === this.currentModeIndex ? new Color(80, 150, 80, 255) : new Color(60, 60, 60, 255);
			g.roundRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, btnHeight * 0.2);
			g.fill();

			// 动态调整文字大小，防止文字溢出按钮
			const label = btn.getChildByName("Label")?.getComponent(Label);
			if (label) {
				label.fontSize = Math.min(22, Math.max(12, btnWidth * 0.25));
			}
		});
	}

	/** 创建纯节点，不负责位置计算 */
	private createModeButtons() {
		const btnNames = ["人人对局", "人机简单", "人机中级", "人机高级", "人机大师"];

		btnNames.forEach((name, index) => {
			const btn = new Node(`Btn_${name}`);
			btn.layer = this.node.layer;
			btn.parent = this.node;
			btn.addComponent(UITransform);
			btn.addComponent(Graphics);

			const labelNode = new Node("Label");
			labelNode.layer = this.node.layer;
			labelNode.parent = btn;
			const label = labelNode.addComponent(Label);
			label.string = name;
			label.color = new Color(255, 255, 255, 255);
			label.horizontalAlign = Label.HorizontalAlign.CENTER;
			label.verticalAlign = Label.VerticalAlign.CENTER;

			this.modeButtons.push(btn);

			btn.on(Node.EventType.TOUCH_END, () => {
				this.switchMode(index);
			});
		});
	}

	private switchMode(index: number) {
		this.currentModeIndex = index;
		this.restartGame();

		// 切换后触发重绘 UI
		this.updateLayout();

		if (index === 0) {
			this.isAIMode = false;
		} else {
			this.isAIMode = true;
			if (index === 1) this.ai.setDifficulty(AIDifficulty.EASY);
			else if (index === 2) this.ai.setDifficulty(AIDifficulty.MEDIUM);
			else if (index === 3) this.ai.setDifficulty(AIDifficulty.HARD);
			else if (index === 4) this.ai.setDifficulty(AIDifficulty.MASTER);
		}
	}

	private restartGame() {
		this.chess.reset();
		this.moveHistory = [];
		this.globalSum = 0;
		this.boardView.loadFenWithAnimation(this.chess.fen(), false);
	}

	private showGameOverUI(message: string) {
		if (this.node.getChildByName("GameOverUI")) return;
		const visibleSize = view.getVisibleSize();
		const layer = this.node.layer;
		const uiNode = new Node("GameOverUI");
		uiNode.layer = layer;
		uiNode.parent = this.node;
		uiNode.addComponent(UITransform).setContentSize(visibleSize.width, visibleSize.height);
		uiNode.addComponent(BlockInputEvents);

		const maskG = uiNode.addComponent(Graphics);
		maskG.fillColor = new Color(0, 0, 0, 180);
		maskG.rect(-visibleSize.width / 2, -visibleSize.height / 2, visibleSize.width, visibleSize.height);
		maskG.fill();

		const panel = new Node("Panel");
		panel.layer = layer;
		panel.parent = uiNode;
		panel.addComponent(UITransform).setContentSize(400, 250);
		panel.setPosition(0, 0, 0);
		const panelG = panel.addComponent(Graphics);
		panelG.fillColor = new Color(40, 40, 40, 255);
		panelG.roundRect(-200, -125, 400, 250, 20);
		panelG.fill();

		const labelNode = new Node("Label");
		labelNode.layer = layer;
		labelNode.parent = panel;
		labelNode.addComponent(UITransform).setContentSize(380, 100);
		labelNode.setPosition(0, 30, 0);
		const label = labelNode.addComponent(Label);
		label.string = message;
		label.fontSize = 36;
		label.fontFamily = "Arial";
		label.color = new Color(255, 255, 255, 255);
		label.horizontalAlign = Label.HorizontalAlign.CENTER;
		label.verticalAlign = Label.VerticalAlign.CENTER;

		const btnNode = new Node("RestartBtn");
		btnNode.layer = layer;
		btnNode.parent = panel;
		btnNode.addComponent(UITransform).setContentSize(160, 60);
		btnNode.setPosition(0, -60, 0);
		const btnG = btnNode.addComponent(Graphics);
		btnG.fillColor = new Color(80, 150, 80, 255);
		btnG.roundRect(-80, -30, 160, 60, 10);
		btnG.fill();

		const btnLabelNode = new Node("Label");
		btnLabelNode.layer = layer;
		btnLabelNode.parent = btnNode;
		const btnLabel = btnLabelNode.addComponent(Label);
		btnLabel.string = "重新开始";
		btnLabel.fontSize = 28;
		btnLabel.fontFamily = "Arial";
		btnLabel.color = new Color(255, 255, 255, 255);

		btnNode.on(Node.EventType.TOUCH_END, () => {
			uiNode.destroy();
			this.restartGame();
		});
	}
}
