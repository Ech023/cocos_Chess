import { _decorator, Component, Node, UITransform, view, Graphics, Color, Label, BlockInputEvents } from "cc";
import { ChessBoardView } from "./ChessBoardView";
import { Chess } from "./chessCore/chess";
const { ccclass } = _decorator;

/**
 * 游戏主入口控制器。
 * 负责统筹棋局逻辑、棋盘视图、UI 自适应布局以及全局弹窗（如游戏结束）。
 */
@ccclass("ChessGame")
export class ChessGame extends Component {
	/** 棋局逻辑实例 */
	private chess!: Chess;
	/** 棋盘视图组件 */
	private boardView!: ChessBoardView;
	/** 棋盘根节点，用于自适应缩放 */
	private boardNode!: Node;

	/** 走子历史记录（代数记谱法） */
	private moveHistory: string[] = [];
	/** 初始盘面的 FEN 字符串，用于重新开始或悔棋 */
	private initialFen: string = new Chess().fen();

	/**
	 * 组件生命周期：启动时调用。
	 * 初始化棋局，动态创建棋盘节点，并绑定屏幕尺寸变化事件。
	 */
	start() {
		this.chess = new Chess();
		this.initialFen = this.chess.fen();

		const visibleSize = view.getVisibleSize();
		const screenW = visibleSize.width;
		const screenH = visibleSize.height;

		// 1. 创建棋盘节点
		this.boardNode = new Node("ChessBoard");
		this.boardNode.layer = this.node.layer;
		this.boardNode.parent = this.node;

		// 【核心设定】包含上下死子展示区的总基准尺寸，设为 940 (820棋盘 + 60*2留白)
		const boardBaseSize = 940;

		// 计算宽、高分别能容纳的最大缩放比例，取较小值以保证棋盘完整显示
		const scaleW = (screenW * 0.95) / boardBaseSize;
		const scaleH = (screenH * 0.95) / boardBaseSize;
		const finalScale = Math.min(scaleW, scaleH);

		this.boardNode.addComponent(UITransform).setContentSize(boardBaseSize, boardBaseSize);
		this.boardNode.setScale(finalScale, finalScale, 1);
		this.boardNode.setPosition(0, 0, 0); // 居中

		this.boardView = this.boardNode.addComponent(ChessBoardView);
		this.boardView.init(this.chess);

		this.boardView.onMoveSuccess = () => {
			this.moveHistory = this.chess.history();
		};
		this.boardView.onGameOver = msg => {
			this.showGameOverUI(msg);
		};

		// 2. 监听窗口尺寸变化，实时自适应
		view.on("canvas-resize", this.updateLayout, this);
	}

	/**
	 * 组件生命周期：销毁时调用。
	 * 移除屏幕尺寸变化监听，防止内存泄漏。
	 */
	onDestroy() {
		view.off("canvas-resize", this.updateLayout, this);
	}

	/**
	 * 核心逻辑：根据屏幕尺寸动态缩放并居中棋盘。
	 */
	private updateLayout() {
		const visibleSize = view.getVisibleSize();
		const screenW = visibleSize.width;
		const screenH = visibleSize.height;

		const boardBaseSize = 940;

		const scaleW = (screenW * 0.95) / boardBaseSize;
		const scaleH = (screenH * 0.95) / boardBaseSize;
		const finalScale = Math.min(scaleW, scaleH);

		this.boardNode.setScale(finalScale, finalScale, 1);
		this.boardNode.setPosition(0, 0, 0);
	}

	/**
	 * 显示游戏结束的结算弹窗。
	 * @param message 结算提示信息（如："绝杀！白方获胜！"）
	 */
	private showGameOverUI(message: string) {
		if (this.node.getChildByName("GameOverUI")) return;

		const visibleSize = view.getVisibleSize();
		const layer = this.node.layer;

		// 1. 全屏遮罩层（拦截点击，防止下棋）
		const uiNode = new Node("GameOverUI");
		uiNode.layer = layer;
		uiNode.parent = this.node;
		uiNode.addComponent(UITransform).setContentSize(visibleSize.width, visibleSize.height);
		uiNode.addComponent(BlockInputEvents);

		const maskG = uiNode.addComponent(Graphics);
		maskG.fillColor = new Color(0, 0, 0, 180);
		maskG.rect(-visibleSize.width / 2, -visibleSize.height / 2, visibleSize.width, visibleSize.height);
		maskG.fill();

		// 2. 弹窗面板
		const panel = new Node("Panel");
		panel.layer = layer;
		panel.parent = uiNode;
		panel.addComponent(UITransform).setContentSize(400, 250);
		panel.setPosition(0, 0, 0);

		const panelG = panel.addComponent(Graphics);
		panelG.fillColor = new Color(40, 40, 40, 255);
		panelG.roundRect(-200, -125, 400, 250, 20);
		panelG.fill();

		// 3. 提示文字
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

		// 4. 重新开始按钮
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

	/**
	 * 重新开始游戏。
	 */
	private restartGame() {
		this.chess.reset();
		this.moveHistory = [];
		this.boardView.loadFenWithAnimation(this.chess.fen(), false);
	}
}
