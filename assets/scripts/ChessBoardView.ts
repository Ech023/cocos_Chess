import {
	_decorator,
	Component,
	Node,
	UITransform,
	Sprite,
	SpriteFrame,
	Color,
	Vec3,
	resources,
	Graphics,
	tween,
	Tween,
	EventTouch,
	Vec2,
	BlockInputEvents,
	Layout,
	UIOpacity,
	math,
	SpriteAtlas,
	Label,
} from "cc";
import { Chess, Square, Move, PieceSymbol } from "./chessCore/chess";
import { ChessAI, AIDifficulty } from "./ChessAI";

const { ccclass } = _decorator;

const BOARD_SIZE = 800;
const CELL_SIZE = BOARD_SIZE / 8;
const BOARD_PADDING = 10;
const TOTAL_SIZE = BOARD_SIZE + BOARD_PADDING * 2;

const COLOR_LIGHT = new Color(240, 217, 181, 255);
const COLOR_DARK = new Color(181, 136, 99, 255);
const COLOR_BASE = new Color(40, 35, 30, 255);
const COLOR_SELECTED = new Color(255, 255, 0, 100);
const COLOR_LAST_MOVE = new Color(255, 255, 0, 80);
const COLOR_DOT = new Color(0, 0, 0, 80);
const COLOR_RING = new Color(0, 0, 0, 90);

const FILES = "abcdefgh";

@ccclass("ChessBoardView")
export class ChessBoardView extends Component {
	private chess!: Chess;
	private pieces = new Map<Square, { node: Node; sprite: Sprite }>();
	private pieceFrames = new Map<string, SpriteFrame>();
	private highlightG!: Graphics;
	private dragLayer!: Node;

	private selected: Square | null = null;
	private targets = new Set<Square>();
	private lastFrom: Square | null = null;
	private lastTo: Square | null = null;

	private isPotentialDrag = false;
	private isDragging = false;
	private isDoubleTapCancel = false;
	private draggingSquare: Square | null = null;
	private dragNode: Node | null = null;
	private originalParentNode: Node | null = null;
	private dragStartPos: Vec2 = new Vec2();

	private isPendingPromotion = false;
	private pendingFrom: Square | null = null;
	private pendingTo: Square | null = null;

	private capturedTopNode!: Node;
	private capturedBottomNode!: Node;
	private capturedNodePool: Node[] = [];

	private isAIThinking = false;
	private aiTurnId = 0;

	private winRateHud: Node | null = null;
	private winRateLabel: Label | null = null;
	private winRateBarG: Graphics | null = null;
	private winRateGlowNode: Node | null = null;

	private aiStatusHud: Node | null = null;
	private aiStatusGlow: Node | null = null;
	private aiThinkingProgress: Graphics | null = null;
	private aiProgressText: Label | null = null;
	private aiThinkingStartTime = 0;
	private aiThinkingDurationMs = 1800;
	private aiThinkingFrameHandle: number | null = null;
	private aiStatusActive = false;

	private aiEvaluator: ChessAI | null = null;

	public onMoveSuccess: (() => void) | null = null;
	public onGameOver: ((message: string) => void) | null = null;
	public onAIMoveAsync: (() => Promise<Move | null>) | null = null;

	public init(chess: Chess) {
		this.chess = chess;
		this.aiEvaluator = new ChessAI(chess, AIDifficulty.MEDIUM);

		this.node.getComponent(UITransform)?.setContentSize(TOTAL_SIZE, TOTAL_SIZE);
		this.buildStaticBoard();
		this.ensureHUD();

		this.loadAssets(() => {
			this.buildPiecesAndHighlights();
			this.refresh();
			this.updateBoardWinRate();
		});
	}

	private ensureHUD() {
		this.ensureWinRateHud();
		this.ensureAIStatusHud();
	}

	private ensureWinRateHud() {
		if (this.winRateHud && this.winRateHud.isValid) return;

		this.winRateHud = new Node("WinRateHud");
		this.winRateHud.layer = this.node.layer;
		this.winRateHud.parent = this.node;
		this.winRateHud.setPosition(0, TOTAL_SIZE / 2 + 100, 0);
		this.winRateHud.addComponent(UITransform).setContentSize(420, 100);

		const bg = this.winRateHud.addComponent(Graphics);
		bg.fillColor = new Color(20, 20, 20, 220);
		bg.roundRect(-210, -50, 420, 100, 18);
		bg.fill();

		const labelNode = new Node("WinRateLabel");
		labelNode.layer = this.node.layer;
		labelNode.parent = this.winRateHud;
		labelNode.setPosition(0, 22, 0);

		const label = labelNode.addComponent(Label);
		label.string = "胜率：白 50.0% / 黑 50.0%";
		label.fontSize = 22;
		label.fontFamily = "Arial";
		label.horizontalAlign = Label.HorizontalAlign.CENTER;
		label.verticalAlign = Label.VerticalAlign.CENTER;
		label.color = new Color(255, 255, 255, 255);
		label.enableOutline = true;
		label.outlineColor = new Color(0, 0, 0, 255);
		label.outlineWidth = 2;
		this.winRateLabel = label;

		const barNode = new Node("WinRateBar");
		barNode.layer = this.node.layer;
		barNode.parent = this.winRateHud;
		barNode.setPosition(0, -22, 0);
		barNode.addComponent(UITransform).setContentSize(360, 12);
		this.winRateBarG = barNode.addComponent(Graphics);

		this.winRateGlowNode = new Node("BarGlow");
		this.winRateGlowNode.layer = this.node.layer;
		this.winRateGlowNode.parent = barNode;
		const glowG = this.winRateGlowNode.addComponent(Graphics);
		glowG.fillColor = new Color(255, 255, 200, 255);
		glowG.circle(0, 0, 8);
		glowG.fill();

		const op = this.winRateGlowNode.addComponent(UIOpacity);
		tween(op)
			.repeatForever(tween().to(0.5, { opacity: 100 }).to(0.5, { opacity: 255 }))
			.start();
		tween(this.winRateGlowNode)
			.repeatForever(
				tween()
					.to(0.6, { scale: new Vec3(1.6, 1.6, 1) })
					.to(0.6, { scale: new Vec3(1, 1, 1) }),
			)
			.start();

		this.drawWinRateBar(0.5);
	}

	private drawWinRateBar(whiteWin: number) {
		if (!this.winRateBarG) return;
		this.winRateBarG.clear();

		const width = 360,
			height = 12,
			halfW = width / 2;

		this.winRateBarG.fillColor = new Color(50, 50, 50, 255);
		this.winRateBarG.roundRect(-halfW, -height / 2, width, height, 6);
		this.winRateBarG.fill();

		const whiteW = width * whiteWin;
		if (whiteW > 0) {
			this.winRateBarG.fillColor = new Color(240, 240, 240, 255);
			this.winRateBarG.roundRect(-halfW, -height / 2, whiteW, height, 6);
			this.winRateBarG.fill();
		}

		const blackW = width * (1 - whiteWin);
		if (blackW > 0) {
			this.winRateBarG.fillColor = new Color(25, 25, 25, 255);
			this.winRateBarG.roundRect(halfW - blackW, -height / 2, blackW, height, 6);
			this.winRateBarG.fill();
		}

		if (this.winRateGlowNode) this.winRateGlowNode.setPosition(-halfW + whiteW, 0, 0);
	}

	private ensureAIStatusHud() {
		if (this.aiStatusHud && this.aiStatusHud.isValid) return;

		this.aiStatusHud = new Node("AIStatusHud");
		this.aiStatusHud.layer = this.node.layer;
		this.aiStatusHud.parent = this.node;
		this.aiStatusHud.setPosition(0, TOTAL_SIZE / 2 + 180, 0);
		this.aiStatusHud.addComponent(UITransform).setContentSize(220, 52);

		const bg = this.aiStatusHud.addComponent(Graphics);
		bg.fillColor = new Color(20, 20, 20, 210);
		bg.roundRect(-110, -26, 220, 52, 18);
		bg.fill();

		const glow = new Node("Glow");
		glow.layer = this.node.layer;
		glow.parent = this.aiStatusHud;
		glow.setPosition(-70, 0, 0);
		glow.addComponent(UITransform).setContentSize(18, 18);
		const glowG = glow.addComponent(Graphics);
		glowG.fillColor = new Color(80, 220, 100, 255);
		glowG.circle(0, 0, 8);
		glowG.fill();
		this.aiStatusGlow = glow;

		const text = new Node("Text");
		text.layer = this.node.layer;
		text.parent = this.aiStatusHud;
		text.setPosition(18, 0, 0);
		const label = text.addComponent(Label);
		label.string = "AI 就绪";
		label.fontSize = 22;
		label.fontFamily = "Arial";
		label.color = new Color(255, 255, 255, 255);
		label.horizontalAlign = Label.HorizontalAlign.LEFT;
		label.verticalAlign = Label.VerticalAlign.CENTER;
		this.aiProgressText = label;

		const progressNode = new Node("Progress");
		progressNode.layer = this.node.layer;
		progressNode.parent = this.aiStatusHud;
		progressNode.setPosition(0, -18, 0);
		progressNode.addComponent(UITransform).setContentSize(160, 8);
		const barG = progressNode.addComponent(Graphics);
		barG.fillColor = new Color(70, 70, 70, 255);
		barG.roundRect(-80, -4, 160, 8, 4);
		barG.fill();
		this.aiThinkingProgress = barG;
	}

	private startAIThinkingUI() {
		if (!this.aiStatusHud || !this.aiStatusGlow || !this.aiThinkingProgress) return;
		this.aiStatusActive = true;
		this.aiThinkingStartTime = performance.now();
		this.aiProgressText!.string = "AI 思考中";
		if (this.aiThinkingFrameHandle !== null) cancelAnimationFrame(this.aiThinkingFrameHandle);
		this.aiThinkingFrameHandle = requestAnimationFrame(() => this.updateAIThinkingUI());
	}

	private updateAIThinkingUI() {
		if (!this.aiStatusActive || !this.aiStatusGlow || !this.aiThinkingProgress) return;
		const elapsed = performance.now() - this.aiThinkingStartTime;
		const progress = Math.max(0.05, Math.min(1, elapsed / this.aiThinkingDurationMs));

		const glow = this.aiStatusGlow.getComponent(Graphics)!;
		glow.clear();
		glow.fillColor = new Color(80, 220, 100, 255);
		glow.circle(0, 0, 8);
		glow.fill();

		const g = this.aiThinkingProgress;
		g.clear();
		g.fillColor = new Color(70, 70, 70, 255);
		g.roundRect(-80, -4, 160, 8, 4);
		g.fill();
		g.fillColor = new Color(90, 200, 255, 255);
		g.roundRect(-80, -4, 160 * progress, 8, 4);
		g.fill();

		this.aiProgressText!.string = `AI 思考中 ${(progress * 100).toFixed(0)}%`;
		this.aiThinkingFrameHandle = requestAnimationFrame(() => this.updateAIThinkingUI());
	}

	private finishAIThinkingUI() {
		this.aiStatusActive = false;
		if (this.aiThinkingFrameHandle !== null) {
			cancelAnimationFrame(this.aiThinkingFrameHandle);
			this.aiThinkingFrameHandle = null;
		}
		if (this.aiStatusGlow && this.aiStatusGlow.isValid) {
			const glow = this.aiStatusGlow.getComponent(Graphics)!;
			glow.clear();
			glow.fillColor = new Color(80, 220, 100, 255);
			glow.circle(0, 0, 8);
			glow.fill();
		}
		if (this.aiThinkingProgress) {
			this.aiThinkingProgress.clear();
			this.aiThinkingProgress.fillColor = new Color(70, 70, 70, 255);
			this.aiThinkingProgress.roundRect(-80, -4, 160, 8, 4);
			this.aiThinkingProgress.fill();
			this.aiThinkingProgress.fillColor = new Color(90, 200, 255, 255);
			this.aiThinkingProgress.roundRect(-80, -4, 160, 8, 4);
			this.aiThinkingProgress.fill();
		}
		if (this.aiProgressText) this.aiProgressText.string = "AI 就绪";
	}

	private updateBoardWinRate() {
		if (!this.aiEvaluator || !this.winRateLabel) return;
		const score = this.getCurrentBoardScore();
		const whiteWin = 1 / (1 + Math.exp(-score / 400));
		const blackWin = 1 - whiteWin;

		const whitePercent = Math.max(0, Math.min(1, whiteWin)) * 100;
		const blackPercent = Math.max(0, Math.min(1, blackWin)) * 100;

		this.winRateLabel.string = `胜率：白 ${whitePercent.toFixed(1)}% / 黑 ${blackPercent.toFixed(1)}%`;
		this.drawWinRateBar(whiteWin);
	}

	private getCurrentBoardScore(): number {
		let total = 0;
		const board = this.chess.board();
		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				const piece = board[row][col];
				if (!piece) continue;
				const base = { p: 100, n: 280, b: 320, r: 479, q: 929, k: 60000 }[piece.type] ?? 0;
				const pst = this.getPiecePST(piece.color, piece.type, row, col);
				const value = base + pst;
				total += piece.color === "w" ? value : -value;
			}
		}
		return total;
	}

	private getPiecePST(color: "w" | "b", type: PieceSymbol, row: number, col: number): number {
		const centerBias = 10 - Math.abs(3.5 - row) - Math.abs(3.5 - col);
		if (type === "p") return centerBias * 2;
		if (type === "n" || type === "b") return centerBias * 3;
		if (type === "r") return centerBias * 4;
		if (type === "q") return centerBias * 5;
		return 0;
	}

	private buildStaticBoard() {
		const baseNode = new Node("StaticBoard");
		baseNode.layer = this.node.layer;
		baseNode.parent = this.node;
		baseNode.addComponent(UITransform).setContentSize(TOTAL_SIZE, TOTAL_SIZE);

		const g = baseNode.addComponent(Graphics);
		g.fillColor = COLOR_BASE;
		g.rect(-TOTAL_SIZE / 2, -TOTAL_SIZE / 2, TOTAL_SIZE, TOTAL_SIZE);
		g.fill();

		for (let rank = 0; rank < 8; rank++) {
			for (let file = 0; file < 8; file++) {
				const x = -BOARD_SIZE / 2 + file * CELL_SIZE;
				const y = -BOARD_SIZE / 2 + rank * CELL_SIZE;
				g.fillColor = ((file + rank) & 1) === 0 ? COLOR_DARK : COLOR_LIGHT;
				g.rect(x, y, CELL_SIZE, CELL_SIZE);
				g.fill();
			}
		}
	}

	private buildPiecesAndHighlights() {
		const layer = this.node.layer;

		for (let rank = 0; rank < 8; rank++) {
			for (let file = 0; file < 8; file++) {
				const square = (FILES[file] + (rank + 1)) as Square;
				const cellNode = new Node(`Sq_${square}`);
				cellNode.layer = layer;
				cellNode.parent = this.node;
				cellNode.setPosition(this.squareToLocal(square));
				cellNode.addComponent(UITransform).setContentSize(CELL_SIZE, CELL_SIZE);

				const pieceNode = new Node("Piece");
				pieceNode.layer = layer;
				pieceNode.parent = cellNode;
				pieceNode.addComponent(UITransform).setContentSize(CELL_SIZE, CELL_SIZE);

				const pieceSp = pieceNode.addComponent(Sprite);
				pieceSp.sizeMode = Sprite.SizeMode.CUSTOM;
				pieceSp.type = Sprite.Type.SIMPLE;
				pieceNode.active = false;

				this.pieces.set(square, { node: pieceNode, sprite: pieceSp });

				cellNode.on(Node.EventType.TOUCH_START, event => this.onTouchStart(square, event));
				cellNode.on(Node.EventType.TOUCH_MOVE, event => this.onTouchMove(square, event));
				cellNode.on(Node.EventType.TOUCH_END, event => this.onTouchEnd(square, event));
				cellNode.on(Node.EventType.TOUCH_CANCEL, event => this.onTouchEnd(square, event));
			}
		}

		const dragLayerNode = new Node("DragLayer");
		dragLayerNode.layer = layer;
		dragLayerNode.parent = this.node;
		dragLayerNode.addComponent(UITransform).setContentSize(TOTAL_SIZE, TOTAL_SIZE);
		this.dragLayer = dragLayerNode;

		const hlNode = new Node("HighlightLayer");
		hlNode.layer = layer;
		hlNode.parent = this.node;
		hlNode.addComponent(UITransform).setContentSize(TOTAL_SIZE, TOTAL_SIZE);
		this.highlightG = hlNode.addComponent(Graphics);

		this.capturedTopNode = new Node("CapturedTop");
		this.capturedTopNode.layer = layer;
		this.capturedTopNode.parent = this.node;
		this.capturedTopNode.addComponent(UITransform).setContentSize(BOARD_SIZE, 50);
		this.capturedTopNode.setPosition(0, TOTAL_SIZE / 2 + 30, 0);
		const layoutTop = this.capturedTopNode.addComponent(Layout);
		layoutTop.type = Layout.Type.HORIZONTAL;
		layoutTop.resizeMode = Layout.ResizeMode.CONTAINER;
		layoutTop.spacingX = 2;

		this.capturedBottomNode = new Node("CapturedBottom");
		this.capturedBottomNode.layer = layer;
		this.capturedBottomNode.parent = this.node;
		this.capturedBottomNode.addComponent(UITransform).setContentSize(BOARD_SIZE, 50);
		this.capturedBottomNode.setPosition(0, -TOTAL_SIZE / 2 - 30, 0);
		const layoutBottom = this.capturedBottomNode.addComponent(Layout);
		layoutBottom.type = Layout.Type.HORIZONTAL;
		layoutBottom.resizeMode = Layout.ResizeMode.CONTAINER;
		layoutBottom.spacingX = 2;
	}

	private loadAssets(onComplete: () => void) {
		const pieces = ["wp", "wn", "wb", "wr", "wq", "wk", "bp", "bn", "bb", "br", "bq", "bk"];
		resources.load(`pieces/texture`, SpriteAtlas, (err, atlas: SpriteAtlas) => {
			if (err) {
				console.error("加载图集失败:", err);
				onComplete();
				return;
			}
			pieces.forEach(p => {
				const frame = atlas.getSpriteFrame(p);
				if (frame) this.pieceFrames.set(p, frame);
				else console.warn(`图集中找不到名为 "${p}" 的子图`);
			});
			onComplete();
		});
	}

	private squareToLocal(square: Square): Vec3 {
		const file = FILES.indexOf(square[0]);
		const rank = parseInt(square[1], 10) - 1;
		const x = -BOARD_SIZE / 2 + file * CELL_SIZE + CELL_SIZE / 2;
		const y = -BOARD_SIZE / 2 + rank * CELL_SIZE + CELL_SIZE / 2;
		return new Vec3(x, y, 0);
	}

	private onTouchStart(square: Square, event: EventTouch) {
		if (this.isPendingPromotion || this.isAIThinking) return;
		const piece = this.chess.get(square);

		if (piece && piece.color === this.chess.turn()) {
			if (this.selected === square) {
				this.clearSelection();
				this.refresh();
				this.isPotentialDrag = false;
				this.isDoubleTapCancel = true;
				return;
			}
			this.isPotentialDrag = true;
			this.isDragging = false;
			this.draggingSquare = square;
			this.dragStartPos = event.getUILocation();
			this.selected = square;
			this.targets = new Set(this.chess.moves({ square, verbose: true }).map((m: Move) => m.to));
			this.refresh();
			const entry = this.pieces.get(square);
			this.dragNode = entry?.node ?? null;
			this.originalParentNode = entry?.node.parent ?? null;
		}
	}

	private onTouchMove(square: Square, event: EventTouch) {
		if (!this.isPotentialDrag || this.isPendingPromotion || this.isAIThinking) return;
		const uiPos = event.getUILocation();
		const dist = Vec2.distance(new Vec2(uiPos.x, uiPos.y), this.dragStartPos);

		if (!this.isDragging && dist > 10) {
			this.isDragging = true;
			if (this.dragNode) {
				this.dragNode.parent = this.dragLayer;
				this.dragNode.setSiblingIndex(this.dragLayer.children.length - 1);
				this.dragNode.setScale(1.2, 1.2, 1);
			}
		}
		if (this.isDragging && this.dragNode) {
			const localPos = this.dragLayer.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
			this.dragNode.setPosition(localPos);
		}
	}

	private onTouchEnd(square: Square, event: EventTouch) {
		if (this.isPendingPromotion || this.isAIThinking) return;
		if (this.isDoubleTapCancel) {
			this.isDoubleTapCancel = false;
			this.resetDragState();
			return;
		}
		if (!this.isDragging) {
			if (this.isPotentialDrag) {
				this.resetDragState();
				this.refresh();
				return;
			}
			this.onSquareClick(square);
			return;
		}
		if (this.isDragging && this.dragNode && this.draggingSquare) {
			const uiPos = event.getUILocation();
			const localPos = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
			let file = Math.round((localPos.x + BOARD_SIZE / 2 - CELL_SIZE / 2) / CELL_SIZE);
			let rank = Math.round((localPos.y + BOARD_SIZE / 2 - CELL_SIZE / 2) / CELL_SIZE);
			let targetSquare: Square | null = null;

			if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
				targetSquare = (FILES[file] + (rank + 1)) as Square;
			}
			if (targetSquare && this.targets.has(targetSquare)) {
				this.restoreDragNode();
				this.clearSelection();
				this.resetDragState();
				this.refresh();
				this.handleMoveIntent(this.draggingSquare || square, targetSquare);
			} else {
				this.restoreDragNode();
				this.resetDragState();
				this.refresh();
			}
		}
	}

	private onSquareClick(square: Square) {
		if (this.isPendingPromotion || this.isAIThinking) return;
		if (this.selected && this.targets.has(square)) {
			const from = this.selected;
			this.clearSelection();
			this.refresh();
			this.handleMoveIntent(from, square);
			return;
		}
		const piece = this.chess.get(square);
		if (piece && piece.color === this.chess.turn()) {
			this.selected = square;
			this.targets = new Set(this.chess.moves({ square, verbose: true }).map((m: Move) => m.to));
			this.refresh();
		} else {
			const isEnemyPiece = piece && piece.color !== this.chess.turn();
			this.clearSelection();
			this.refresh();
			if (isEnemyPiece) this.playInvalidClickAnimation(square);
		}
	}

	private handleMoveIntent(from: Square, to: Square) {
		const piece = this.chess.get(from);
		if (!piece) return;
		if (piece.type === "p") {
			const rank = parseInt(to[1], 10);
			if (rank === 8 || rank === 1) {
				this.isPendingPromotion = true;
				this.pendingFrom = from;
				this.pendingTo = to;
				this.showPromotionUI(piece.color, to);
				return;
			}
		}
		this.executeMove(from, to);
	}

	private async executeMove(from: Square, to: Square, promotion: PieceSymbol = "q") {
		try {
			const targetPiece = this.chess.get(to);
			this.chess.move({ from, to, promotion });

			const history = this.chess.history({ verbose: true });
			if (history.length > 0) {
				const lastMove = history[history.length - 1];
				this.lastFrom = lastMove.from;
				this.lastTo = lastMove.to;
			}

			// 1. 先刷新棋盘，落子立刻发生，不掉帧
			this.refresh();

			// 2. 异步播放特效（不阻塞代码执行）
			if (targetPiece) {
				this.playCaptureExplosion(to, targetPiece.color);
			}

			// 3. 处理后续逻辑
			this.handleMoveSuccess();
			this.updateBoardWinRate();

			// 4. AI 回合检测
			if (!this.chess.isGameOver() && this.chess.turn() === "b") {
				if (this.isAIThinking) return;
				this.isAIThinking = true;
				this.startAIThinkingUI();
				this.aiTurnId++;
				const currentTurnId = this.aiTurnId;

				if (this.onAIMoveAsync) {
					// 延迟 50ms，让渲染引擎先画完当前帧，再开始 AI 计算，防止掉帧卡顿
					setTimeout(async () => {
						const aiMove = await this.onAIMoveAsync();
						if (currentTurnId !== this.aiTurnId) {
							this.isAIThinking = false;
							this.finishAIThinkingUI();
							return;
						}
						this.isAIThinking = false;
						this.finishAIThinkingUI();
						if (aiMove && !this.chess.isGameOver() && this.chess.turn() === "b") {
							this.executeMove(
								aiMove.from as Square,
								aiMove.to as Square,
								(aiMove.promotion as PieceSymbol) || "q",
							);
						}
					}, 50);
				} else {
					this.isAIThinking = false;
					this.finishAIThinkingUI();
				}
			}
		} catch (e) {
			console.warn("Move failed:", e);
			this.isAIThinking = false;
			this.finishAIThinkingUI();
			this.refresh();
		}
	}

	private showPromotionUI(color: "w" | "b", targetSquare: Square) {
		const layer = this.node.layer;
		const uiNode = new Node("PromotionUI");
		uiNode.layer = layer;
		uiNode.parent = this.node;
		uiNode.addComponent(UITransform).setContentSize(TOTAL_SIZE, TOTAL_SIZE);
		uiNode.addComponent(BlockInputEvents);

		const maskG = uiNode.addComponent(Graphics);
		maskG.fillColor = new Color(0, 0, 0, 150);
		maskG.rect(-TOTAL_SIZE / 2, -TOTAL_SIZE / 2, TOTAL_SIZE, TOTAL_SIZE);
		maskG.fill();

		const panelWidth = 320,
			panelHeight = 100,
			gap = 10;
		const panel = new Node("Panel");
		panel.layer = layer;
		panel.parent = uiNode;
		panel.addComponent(UITransform).setContentSize(panelWidth, panelHeight);
		const panelG = panel.addComponent(Graphics);
		panelG.fillColor = new Color(40, 40, 40, 255);
		panelG.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 15);
		panelG.fill();

		const options: PieceSymbol[] = ["q", "r", "b", "n"];
		options.forEach((type, index) => {
			const btnNode = new Node("Btn_" + type);
			btnNode.layer = layer;
			btnNode.parent = panel;
			btnNode.addComponent(UITransform).setContentSize(60, 60);
			const totalW = options.length * 60 + (options.length - 1) * gap;
			const startX = -totalW / 2 + 30;
			btnNode.setPosition(startX + index * (60 + gap), 0, 0);

			const btnSp = btnNode.addComponent(Sprite);
			btnSp.sizeMode = Sprite.SizeMode.CUSTOM;
			btnSp.color = new Color(80, 80, 80, 255);

			const iconNode = new Node("Icon");
			iconNode.layer = layer;
			iconNode.parent = btnNode;
			iconNode.addComponent(UITransform).setContentSize(50, 50);
			const iconSp = iconNode.addComponent(Sprite);
			iconSp.sizeMode = Sprite.SizeMode.CUSTOM;
			const frame = this.pieceFrames.get(color + type);
			if (frame) iconSp.spriteFrame = frame;

			btnNode.on(Node.EventType.TOUCH_END, () => {
				uiNode.destroy();
				this.isPendingPromotion = false;
				if (this.pendingFrom && this.pendingTo) this.executeMove(this.pendingFrom, this.pendingTo, type);
				this.pendingFrom = null;
				this.pendingTo = null;
			});
		});
	}

	private showCheckTip() {
		const old = this.node.getChildByName("CheckTip");
		if (old) old.destroy();
		const tipNode = new Node("CheckTip");
		tipNode.layer = this.node.layer;
		tipNode.parent = this.node;
		tipNode.setPosition(0, 0, 0);
		tipNode.addComponent(UITransform).setContentSize(400, 200);

		const label = tipNode.addComponent(Label);
		label.string = "将军！";
		label.fontSize = 60;
		label.fontFamily = "Arial";
		label.isBold = true;
		label.color = new Color(255, 50, 50, 255);
		label.horizontalAlign = Label.HorizontalAlign.CENTER;
		label.verticalAlign = Label.VerticalAlign.CENTER;
		label.enableOutline = true;
		label.outlineColor = new Color(0, 0, 0, 255);
		label.outlineWidth = 4;

		const opacity = tipNode.addComponent(UIOpacity);
		opacity.opacity = 0;
		tipNode.setScale(0.5, 0.5, 1);

		tween(tipNode)
			.to(0.15, { scale: new Vec3(1.2, 1.2, 1) }, { easing: "backOut" })
			.to(0.1, { scale: new Vec3(1, 1, 1) })
			.by(0.5, { position: new Vec3(0, 50, 0) }, { easing: "quadOut" })
			.call(() => {
				if (tipNode.isValid) tipNode.destroy();
			})
			.start();
		tween(opacity).to(0.15, { opacity: 255 }).delay(0.3).to(0.4, { opacity: 0 }).start();
	}

	private handleMoveSuccess() {
		if (this.onMoveSuccess) this.onMoveSuccess();
		if (!this.chess.isGameOver() && this.chess.isCheck()) this.showCheckTip();
		if (!this.chess.isGameOver()) return;

		let msg = "";
		if (this.chess.isCheckmate()) msg = `绝杀！${this.chess.turn() === "w" ? "黑方" : "白方"}获胜！`;
		else if (this.chess.isStalemate()) msg = "逼和（无子可动），平局！";
		else if (this.chess.isThreefoldRepetition()) msg = "三次重复局面，平局！";
		else if (this.chess.isInsufficientMaterial()) msg = "子力不足，平局！";
		else if (this.chess.isDrawByFiftyMoves()) msg = "五十回合无吃子无动兵，平局！";
		else if (this.chess.isDraw()) msg = "平局！";
		if (this.onGameOver) this.onGameOver(msg);
	}

	private clearSelection() {
		this.selected = null;
		this.targets.clear();
	}

	private resetDragState() {
		this.isPotentialDrag = false;
		this.isDragging = false;
		this.draggingSquare = null;
		this.dragNode = null;
		this.originalParentNode = null;
	}

	private restoreDragNode() {
		if (!this.dragNode || !this.originalParentNode) return;
		Tween.stopAllByTarget(this.dragNode);
		this.dragNode.setScale(1, 1, 1);
		this.dragNode.parent = this.originalParentNode;
		this.dragNode.setPosition(0, 0, 0);
	}

	public refresh() {
		this.pieces.forEach(({ node }) => {
			node.active = false;
			node.setPosition(0, 0, 0);
			node.setScale(1, 1, 1);
		});

		const board = this.chess.board();
		for (let r = 0; r < 8; r++) {
			for (let f = 0; f < 8; f++) {
				const cell = board[r][f];
				if (!cell) continue;
				const entry = this.pieces.get(cell.square);
				if (!entry) continue;
				const frame = this.pieceFrames.get(cell.color + cell.type);
				if (frame) {
					entry.sprite.spriteFrame = frame;
					entry.node.active = true;
				}
			}
		}
		this.drawHighlights();
		this.updateCapturedPieces();
	}

	public loadFenWithAnimation(fen: string, isRewind: boolean = false) {
		this.aiTurnId++;
		this.isAIThinking = false;
		this.finishAIThinkingUI();

		const ui = this.node.getChildByName("PromotionUI");
		if (ui) ui.destroy();
		this.isPendingPromotion = false;
		this.chess.load(fen);

		this.clearSelection();
		this.lastFrom = null;
		this.lastTo = null;
		this.resetDragState();

		this.pieces.forEach(({ node }) => {
			node.active = false;
			node.setPosition(0, 0, 0);
			node.setScale(1, 1, 1);
			Tween.stopAllByTarget(node);
		});

		const board = this.chess.board();
		for (let r = 0; r < 8; r++) {
			for (let f = 0; f < 8; f++) {
				const cell = board[r][f];
				if (!cell) continue;
				const entry = this.pieces.get(cell.square);
				if (!entry) continue;
				const frame = this.pieceFrames.get(cell.color + cell.type);
				if (frame) {
					entry.sprite.spriteFrame = frame;
					entry.node.active = true;
					const startY = isRewind ? CELL_SIZE * 1.5 : -CELL_SIZE * 1.5;
					entry.node.setPosition(0, startY, 0);
					tween(entry.node)
						.to(0.35, { position: new Vec3(0, 0, 0) }, { easing: "cubicOut" })
						.start();
				}
			}
		}
		this.drawHighlights();
		this.updateCapturedPieces();
		this.updateBoardWinRate();
	}

	private updateCapturedPieces() {
		if (!this.capturedTopNode || !this.capturedBottomNode) return;
		const history = this.chess.history({ verbose: true });
		const deadWhite: string[] = [];
		const deadBlack: string[] = [];

		history.forEach(move => {
			if (move.captured) {
				if (move.color === "w") deadBlack.push("b" + move.captured);
				else deadWhite.push("w" + move.captured);
			}
		});

		const sortOrder: Record<string, number> = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
		deadWhite.sort((a, b) => sortOrder[a[1]] - sortOrder[b[1]]);
		deadBlack.sort((a, b) => sortOrder[a[1]] - sortOrder[b[1]]);

		this.capturedTopNode.children.forEach(node => {
			node.active = false;
			this.capturedNodePool.push(node);
		});
		this.capturedTopNode.removeAllChildren();
		this.capturedBottomNode.children.forEach(node => {
			node.active = false;
			this.capturedNodePool.push(node);
		});
		this.capturedBottomNode.removeAllChildren();

		deadWhite.forEach(key => this.createCapturedNode(key, this.capturedTopNode));
		deadBlack.forEach(key => this.createCapturedNode(key, this.capturedBottomNode));
	}

	private createCapturedNode(pieceKey: string, parent: Node) {
		let node = this.capturedNodePool.pop();
		if (!node) {
			node = new Node("DeadPiece");
			node.layer = this.node.layer;
			node.addComponent(UITransform).setContentSize(40, 40);
			node.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
		}
		node.active = true;
		node.parent = parent;
		const sp = node.getComponent(Sprite)!;
		const frame = this.pieceFrames.get(pieceKey);
		if (frame) sp.spriteFrame = frame;
	}

	private playCaptureExplosion(square: Square, capturedColor: "w" | "b") {
		const pos = this.squareToLocal(square);
		const layer = this.node.layer;
		const boomNode = new Node("Explosion");
		boomNode.layer = layer;
		boomNode.parent = this.dragLayer;
		boomNode.setPosition(pos);

		const particleColor = capturedColor === "w" ? new Color(255, 255, 255, 255) : new Color(50, 50, 50, 255);

		for (let i = 0; i < 8; i++) {
			const pNode = new Node("Particle");
			pNode.layer = layer;
			pNode.parent = boomNode;
			pNode.addComponent(UITransform).setContentSize(12, 12);
			const pG = pNode.addComponent(Graphics);
			pG.fillColor = particleColor;
			pG.circle(0, 0, 6);
			pG.fill();
			const opacity = pNode.addComponent(UIOpacity);
			opacity.opacity = 255;

			const angle = math.randomRange(0, Math.PI * 2);
			const distance = math.randomRange(30, 70);
			const targetX = Math.cos(angle) * distance;
			const targetY = Math.sin(angle) * distance;

			tween(pNode)
				.to(0.3, { position: new Vec3(targetX, targetY, 0), scale: new Vec3(0.1, 0.1, 1) }, { easing: "quadOut" })
				.start();
			tween(opacity).to(0.3, { opacity: 0 }).start();
		}
		tween(boomNode)
			.delay(0.35)
			.call(() => boomNode.destroy())
			.start();
	}

	private playInvalidClickAnimation(square: Square) {
		const entry = this.pieces.get(square);
		if (!entry || !entry.node.active) return;
		const piece = this.chess.get(square);
		if (!piece) return;
		const node = entry.node;
		Tween.stopAllByTarget(node);
		node.setPosition(0, 0, 0);
		const offsetY = piece.color === "w" ? -CELL_SIZE * 0.2 : CELL_SIZE * 0.2;
		tween(node)
			.to(0.08, { position: new Vec3(0, offsetY, 0) }, { easing: "quadOut" })
			.to(0.25, { position: new Vec3(0, 0, 0) }, { easing: "bounceOut" })
			.start();
	}

	private drawHighlights() {
		if (!this.highlightG) return;
		this.highlightG.clear();
		if (this.lastFrom) this.drawSquareMask(this.lastFrom, COLOR_LAST_MOVE);
		if (this.lastTo) this.drawSquareMask(this.lastTo, COLOR_LAST_MOVE);
		if (this.selected) this.drawSquareMask(this.selected, COLOR_SELECTED);
		this.targets.forEach(sq => {
			const targetPiece = this.chess.get(sq);
			if (targetPiece) this.drawCaptureRing(sq);
			else this.drawMoveDot(sq);
		});
	}

	private drawSquareMask(square: Square, color: Color) {
		const file = FILES.indexOf(square[0]);
		const rank = parseInt(square[1], 10) - 1;
		const x = -BOARD_SIZE / 2 + file * CELL_SIZE;
		const y = -BOARD_SIZE / 2 + rank * CELL_SIZE;
		this.highlightG.fillColor = color;
		this.highlightG.rect(x, y, CELL_SIZE, CELL_SIZE);
		this.highlightG.fill();
	}

	private drawMoveDot(square: Square) {
		const file = FILES.indexOf(square[0]);
		const rank = parseInt(square[1], 10) - 1;
		const centerX = -BOARD_SIZE / 2 + file * CELL_SIZE + CELL_SIZE / 2;
		const centerY = -BOARD_SIZE / 2 + rank * CELL_SIZE + CELL_SIZE / 2;
		this.highlightG.fillColor = COLOR_DOT;
		this.highlightG.circle(centerX, centerY, CELL_SIZE * 0.175);
		this.highlightG.fill();
	}

	private drawCaptureRing(square: Square) {
		const file = FILES.indexOf(square[0]);
		const rank = parseInt(square[1], 10) - 1;
		const centerX = -BOARD_SIZE / 2 + file * CELL_SIZE + CELL_SIZE / 2;
		const centerY = -BOARD_SIZE / 2 + rank * CELL_SIZE + CELL_SIZE / 2;
		this.highlightG.strokeColor = COLOR_RING;
		this.highlightG.lineWidth = CELL_SIZE * 0.15;
		this.highlightG.circle(centerX, centerY, CELL_SIZE * 0.45);
		this.highlightG.stroke();
	}
}
