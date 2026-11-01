import {
	_decorator,
	Component,
	Node,
	UITransform,
	Sprite,
	SpriteFrame,
	Texture2D,
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
} from "cc";
import { Chess, Move, PieceSymbol, Square } from "./chessCore/chess";
const { ccclass } = _decorator;

/** 棋盘逻辑宽度 */
const BOARD_SIZE = 800;
/** 单个格子宽度 */
const CELL_SIZE = BOARD_SIZE / 8;
/** 底座边框宽度 */
const BOARD_PADDING = 10;
/** 棋盘本体总尺寸 (820) */
const TOTAL_SIZE = BOARD_SIZE + BOARD_PADDING * 2;

/** 浅色格子颜色 */
const COLOR_LIGHT = new Color(240, 217, 181, 255);
/** 深色格子颜色 */
const COLOR_DARK = new Color(181, 136, 99, 255);
/** 底座颜色 */
const COLOR_BASE = new Color(40, 35, 30, 255);
/** 选中高亮颜色 */
const COLOR_SELECTED = new Color(255, 255, 0, 100);
/** 上一步落子记录高亮颜色 */
const COLOR_LAST_MOVE = new Color(255, 255, 0, 80);
/** 合法空位落点提示颜色（半透明圆点） */
const COLOR_DOT = new Color(0, 0, 0, 80);
/** 可吃子提示颜色（半透明圆环） */
const COLOR_RING = new Color(0, 0, 0, 90);

/** 棋盘横坐标字符集 */
const FILES = "abcdefgh";

/**
 * 棋盘渲染与交互视图。
 * 负责绘制棋盘、加载棋子、处理点击与拖拽交互、升变弹窗、死子合集以及盘面动画。
 */
@ccclass("ChessBoardView")
export class ChessBoardView extends Component {
	private chess!: Chess;
	/** 缓存 64 个格子的棋子节点 */
	private pieces = new Map<Square, { node: Node; sprite: Sprite }>();
	/** 缓存已加载的棋子 SpriteFrame */
	private pieceFrames = new Map<string, SpriteFrame>();
	/** 高亮层绘图组件 */
	private highlightG!: Graphics;
	/** 拖拽层根节点，确保拖拽的棋子显示在最上层 */
	private dragLayer!: Node;

	/** 当前选中的棋子格子 */
	private selected: Square | null = null;
	/** 当前选中棋子可走的格子集合 */
	private targets = new Set<Square>();
	/** 上一步的起点 */
	private lastFrom: Square | null = null;
	/** 上一步的终点 */
	private lastTo: Square | null = null;

	// --- 拖拽状态变量 ---
	private isPotentialDrag = false;
	private isDragging = false;
	private isDoubleTapCancel = false;
	private draggingSquare: Square | null = null;
	private dragNode: Node | null = null;
	private originalParentNode: Node | null = null;
	private dragStartPos: Vec2 = new Vec2();

	// --- 升变状态记录 ---
	private isPendingPromotion = false;
	private pendingFrom: Square | null = null;
	private pendingTo: Square | null = null;

	// --- 死亡棋子合集相关 ---
	/** 黑方死亡区（上方），存放白方吃掉的黑子 */
	private capturedTopNode!: Node;
	/** 白方死亡区（下方），存放黑方吃掉的白子 */
	private capturedBottomNode!: Node;
	/** 缓存死亡棋子节点池，防止频繁销毁创建 */
	private capturedNodePool: Node[] = [];

	/** 走子成功后的回调（用于通知外部刷新历史记录等） */
	public onMoveSuccess: (() => void) | null = null;
	/** 游戏结束后的回调（用于通知外部弹出结算面板） */
	public onGameOver: ((message: string) => void) | null = null;

	/**
	 * 初始化棋盘视图。
	 * @param chess chess.js 实例
	 */
	public init(chess: Chess) {
		this.chess = chess;
		this.node.getComponent(UITransform)?.setContentSize(TOTAL_SIZE, TOTAL_SIZE);
		this.buildStaticBoard();
		this.loadAssets(() => {
			this.buildPiecesAndHighlights();
			this.refresh();
		});
	}

	/**
	 * 构建静态底板（底座边框与 64 个黑白格子）。
	 */
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

	/**
	 * 构建动态层：包含 64 个交互格子、隐藏的棋子节点、拖拽层、高亮层和死子合集区。
	 */
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
				pieceSp.trim = false;
				pieceNode.active = false;

				this.pieces.set(square, { node: pieceNode, sprite: pieceSp });

				cellNode.on(Node.EventType.TOUCH_START, (event: EventTouch) => this.onTouchStart(square, event));
				cellNode.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.onTouchMove(square, event));
				cellNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.onTouchEnd(square, event));
				cellNode.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.onTouchEnd(square, event));
			}
		}

		// 拖拽层：在棋子层之上
		const dragLayerNode = new Node("DragLayer");
		dragLayerNode.layer = layer;
		dragLayerNode.parent = this.node;
		dragLayerNode.addComponent(UITransform).setContentSize(TOTAL_SIZE, TOTAL_SIZE);
		this.dragLayer = dragLayerNode;

		// 高亮层：在最顶层
		const hlNode = new Node("HighlightLayer");
		hlNode.layer = layer;
		hlNode.parent = this.node;
		hlNode.addComponent(UITransform).setContentSize(TOTAL_SIZE, TOTAL_SIZE);
		this.highlightG = hlNode.addComponent(Graphics);

		// ================= 死亡棋子展示区 =================
		// 上方（白方吃黑子）
		this.capturedTopNode = new Node("CapturedTop");
		this.capturedTopNode.layer = layer;
		this.capturedTopNode.parent = this.node;
		this.capturedTopNode.addComponent(UITransform).setContentSize(BOARD_SIZE, 50);
		this.capturedTopNode.setPosition(0, TOTAL_SIZE / 2 + 30, 0);
		const layoutTop = this.capturedTopNode.addComponent(Layout);
		layoutTop.type = Layout.Type.HORIZONTAL;
		layoutTop.resizeMode = Layout.ResizeMode.CONTAINER;
		layoutTop.spacingX = 2;

		// 下方（黑方吃白子）
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
		resources.load(`pieces/chess`, SpriteAtlas, (err, atlas: SpriteAtlas) => {
			if (err) {
				console.error("加载图集失败:", err);
				onComplete();
				return;
			}
			const pieceKeys = ["wp", "wn", "wb", "wr", "wq", "wk", "bp", "bn", "bb", "br", "bq", "bk"];
			pieceKeys.forEach(key => {
				const frame = atlas.getSpriteFrame(key);
				if (frame) {
					this.pieceFrames.set(key, frame);
				} else {
					console.warn(`图集中未找到名为 "${key}" 的 SpriteFrame，请检查小图命名`);
				}
			});
			onComplete();
		});
	}

	/**
	 * 将代数坐标（如 'e4'）转换为本地 UI 坐标。
	 */
	private squareToLocal(square: Square): Vec3 {
		const file = FILES.indexOf(square[0]);
		const rank = parseInt(square[1], 10) - 1;
		const x = -BOARD_SIZE / 2 + file * CELL_SIZE + CELL_SIZE / 2;
		const y = -BOARD_SIZE / 2 + rank * CELL_SIZE + CELL_SIZE / 2;
		return new Vec3(x, y, 0);
	}

	// ================= 交互事件处理 =================

	/**
	 * 触摸开始事件：处理选中棋子逻辑。
	 */
	private onTouchStart(square: Square, event: EventTouch) {
		if (this.isPendingPromotion) return;

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
			this.dragNode = entry.node;
			this.originalParentNode = entry.node.parent;
		}
	}

	/**
	 * 触摸移动事件：处理拖拽逻辑。
	 */
	private onTouchMove(square: Square, event: EventTouch) {
		if (!this.isPotentialDrag || this.isPendingPromotion) return;

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

	/**
	 * 触摸结束事件：处理落子或回弹逻辑。
	 */
	private onTouchEnd(square: Square, event: EventTouch) {
		if (this.isPendingPromotion) return;
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

	/**
	 * 处理纯粹的点击事件（点击目标格子或敌方棋子）。
	 */
	private onSquareClick(square: Square) {
		if (this.isPendingPromotion) return;
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

	/**
	 * 核心拦截：判断这次走子是否为兵升变。
	 */
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

	/**
	 * 执行真正的走子逻辑并更新状态。
	 */
	private executeMove(from: Square, to: Square, promotion: PieceSymbol = "q") {
		try {
			// 走子前记录目标格子是否有棋子（用于判断是否吃子）
			const targetPiece = this.chess.get(to);

			this.chess.move({ from, to, promotion });

			const history = this.chess.history({ verbose: true });
			if (history.length > 0) {
				const lastMove = history[history.length - 1];
				this.lastFrom = lastMove.from;
				this.lastTo = lastMove.to;
			}

			// 【新增】如果发生了吃子，播放爆炸特效
			if (targetPiece) {
				this.playCaptureExplosion(to, targetPiece.color);
			}

			this.refresh();
			this.handleMoveSuccess();
		} catch (e) {
			console.warn("Move failed:", e);
			this.refresh();
		}
	}

	/**
	 * 弹出兵升变选择 UI。
	 */
	private showPromotionUI(color: "w" | "b", targetSquare: Square) {
		const visibleSize = new Vec3(TOTAL_SIZE, TOTAL_SIZE, 0);
		const layer = this.node.layer;

		const uiNode = new Node("PromotionUI");
		uiNode.layer = layer;
		uiNode.parent = this.node;
		uiNode.addComponent(UITransform).setContentSize(visibleSize.x, visibleSize.y);
		uiNode.addComponent(BlockInputEvents);

		const maskG = uiNode.addComponent(Graphics);
		maskG.fillColor = new Color(0, 0, 0, 150);
		maskG.rect(-visibleSize.x / 2, -visibleSize.y / 2, visibleSize.x, visibleSize.y);
		maskG.fill();

		const options: PieceSymbol[] = ["q", "r", "b", "n"];
		const panelWidth = 320;
		const panelHeight = 100;
		const gap = 10;

		const panel = new Node("Panel");
		panel.layer = layer;
		panel.parent = uiNode;
		panel.addComponent(UITransform).setContentSize(panelWidth, panelHeight);

		const panelG = panel.addComponent(Graphics);
		panelG.fillColor = new Color(40, 40, 40, 255);
		panelG.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 15);
		panelG.fill();

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
			if (frame) {
				iconSp.spriteFrame = frame;
			}

			btnNode.on(Node.EventType.TOUCH_END, () => {
				uiNode.destroy();
				this.isPendingPromotion = false;
				if (this.pendingFrom && this.pendingTo) {
					this.executeMove(this.pendingFrom, this.pendingTo, type);
				}
				this.pendingFrom = null;
				this.pendingTo = null;
			});
		});
	}

	/**
	 * 走子成功后的统一出口：触发回调并检查游戏是否结束。
	 */
	private handleMoveSuccess() {
		if (this.onMoveSuccess) this.onMoveSuccess();
		if (!this.chess.isGameOver()) return;
		let msg = "";
		if (this.chess.isCheckmate()) {
			const winner = this.chess.turn() === "w" ? "黑方" : "白方";
			msg = `绝杀！${winner}获胜！`;
		} else if (this.chess.isStalemate()) {
			msg = "逼和（无子可动），平局！";
		} else if (this.chess.isThreefoldRepetition()) {
			msg = "三次重复局面，平局！";
		} else if (this.chess.isInsufficientMaterial()) {
			msg = "子力不足，平局！";
		} else if (this.chess.isDrawByFiftyMoves()) {
			msg = "五十回合无吃子无动兵，平局！";
		} else if (this.chess.isDraw()) {
			msg = "平局！";
		}

		if (this.onGameOver) this.onGameOver(msg);
	}

	/**
	 * 清除当前选中状态和可走目标。
	 */
	private clearSelection() {
		this.selected = null;
		this.targets.clear();
	}

	/**
	 * 重置拖拽过程中的状态变量。
	 */
	private resetDragState() {
		this.isPotentialDrag = false;
		this.isDragging = false;
		this.draggingSquare = null;
		this.dragNode = null;
		this.originalParentNode = null;
	}

	/**
	 * 将拖拽中的棋子归位到原本的父节点，并恢复大小。
	 */
	private restoreDragNode() {
		if (!this.dragNode || !this.originalParentNode) return;
		Tween.stopAllByTarget(this.dragNode);
		this.dragNode.setScale(1, 1, 1);
		this.dragNode.parent = this.originalParentNode;
		this.dragNode.setPosition(0, 0, 0);
	}

	// ================= 渲染与动画 =================

	/**
	 * 全量刷新棋盘 UI：重置所有棋子显隐，更新死子合集，并重新渲染。
	 */
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
		this.updateCapturedPieces(); // 新增：更新上下死子区
	}

	/**
	 * 加载指定 FEN 盘面并播放补间动画。
	 * @param fen 目标 FEN 字符串
	 * @param isRewind 是否为回退操作（决定棋子是从上方还是下方飞入）
	 */
	public loadFenWithAnimation(fen: string, isRewind: boolean = false) {
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
		this.updateCapturedPieces(); // 新增：更新上下死子区
	}

	/**
	 * 解析历史记录，更新被吃掉的棋子合集。
	 */
	private updateCapturedPieces() {
		if (!this.capturedTopNode || !this.capturedBottomNode) return;

		const history = this.chess.history({ verbose: true });
		const deadWhite: string[] = []; // 白子死亡（被黑方吃掉）
		const deadBlack: string[] = []; // 黑子死亡（被白方吃掉）

		history.forEach(move => {
			if (move.captured) {
				if (move.color === "w") {
					deadBlack.push("b" + move.captured); // 白方吃黑子
				} else {
					deadWhite.push("w" + move.captured); // 黑方吃白子
				}
			}
		});

		// ================= 正确的回收逻辑 =================
		// 1. 把上方的死子节点存入对象池
		this.capturedTopNode.children.forEach(node => {
			node.active = false;
			this.capturedNodePool.push(node); // 存入池子
		});
		this.capturedTopNode.removeAllChildren();

		// 2. 把下方的死子节点存入对象池
		this.capturedBottomNode.children.forEach(node => {
			node.active = false;
			this.capturedNodePool.push(node); // 存入池子
		});
		this.capturedBottomNode.removeAllChildren();
		// 渲染上方：白子死亡区（黑方吃掉的子）
		deadWhite.forEach(key => this.createCapturedNode(key, this.capturedTopNode));

		// 渲染下方：黑子死亡区（白方吃掉的子）
		deadBlack.forEach(key => this.createCapturedNode(key, this.capturedBottomNode));
	}

	/**
	 * 创建小尺寸的死子节点，或从对象池中取出复用。
	 */
	private createCapturedNode(pieceKey: string, parent: Node) {
		let node = this.capturedNodePool.pop();
		if (!node) {
			node = new Node("DeadPiece");
			node.layer = this.node.layer;
			node.addComponent(UITransform).setContentSize(60, 60);
			node.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
		}

		node.active = true;
		node.parent = parent;

		const sp = node.getComponent(Sprite)!;
		const frame = this.pieceFrames.get(pieceKey);
		if (frame) {
			sp.spriteFrame = frame;
		}
	}

	/**
	 * 播放吃子时的简单粒子爆炸特效
	 * @param square 被吃掉的棋子所在的格子
	 * @param capturedColor 被吃掉的棋子颜色
	 */
	private playCaptureExplosion(square: Square, capturedColor: "w" | "b") {
		const pos = this.squareToLocal(square);
		const layer = this.node.layer;

		// 创建一个特效容器
		const boomNode = new Node("Explosion");
		boomNode.layer = layer;
		boomNode.parent = this.dragLayer; // 放在最顶层，防止被棋盘遮挡
		boomNode.setPosition(pos);

		// 根据被吃棋子的颜色决定粒子颜色
		const particleColor =
			capturedColor === "w"
				? new Color(255, 255, 255, 255) // 白子爆炸产生白色粒子
				: new Color(50, 50, 50, 255); // 黑子爆炸产生深色粒子

		const particleCount = 16; // 粒子数量

		for (let i = 0; i < particleCount; i++) {
			const pNode = new Node("Particle");
			pNode.layer = layer;
			pNode.parent = boomNode;

			const uiTrans = pNode.addComponent(UITransform);
			uiTrans.setContentSize(16, 16); // 粒子大小

			// 使用 Graphics 画一个小圆点作为粒子
			const pG = pNode.addComponent(Graphics);
			pG.fillColor = particleColor;
			pG.circle(0, 0, 12);
			pG.fill();

			// 添加透明度的控制组件
			const opacity = pNode.addComponent(UIOpacity);
			opacity.opacity = 255;

			// 随机向四周飞散的角度和距离
			const angle = math.randomRange(0, Math.PI * 2);
			const distance = math.randomRange(20, 85);
			const targetX = Math.cos(angle) * distance;
			const targetY = Math.sin(angle) * distance;

			// 播放补间动画
			tween(pNode)
				.to(
					0.3,
					{
						position: new Vec3(targetX, targetY, 0),
						scale: new Vec3(0.1, 0.1, 1), // 飞散过程中缩小
					},
					{ easing: "quadOut" },
				)
				.start();

			// 透明度渐变
			tween(opacity).to(0.3, { opacity: 0 }).start();
		}

		// 0.3 秒后销毁整个特效容器
		tween(boomNode)
			.delay(0.35)
			.call(() => {
				boomNode.destroy();
			})
			.start();
	}

	/**
	 * 播放点击敌方棋子时的退避抖动动画。
	 */
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

	/**
	 * 根据当前状态绘制高亮层（上一步、选中、可落子、可吃子）。
	 */
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

	/**
	 * 绘制半透明方形遮罩（用于选中状态、上一步记录）。
	 */
	private drawSquareMask(square: Square, color: Color) {
		const file = FILES.indexOf(square[0]);
		const rank = parseInt(square[1], 10) - 1;
		const x = -BOARD_SIZE / 2 + file * CELL_SIZE;
		const y = -BOARD_SIZE / 2 + rank * CELL_SIZE;
		this.highlightG.fillColor = color;
		this.highlightG.rect(x, y, CELL_SIZE, CELL_SIZE);
		this.highlightG.fill();
	}

	/**
	 * 绘制可落子空位的提示圆点。
	 */
	private drawMoveDot(square: Square) {
		const file = FILES.indexOf(square[0]);
		const rank = parseInt(square[1], 10) - 1;
		const centerX = -BOARD_SIZE / 2 + file * CELL_SIZE + CELL_SIZE / 2;
		const centerY = -BOARD_SIZE / 2 + rank * CELL_SIZE + CELL_SIZE / 2;
		this.highlightG.fillColor = COLOR_DOT;
		this.highlightG.circle(centerX, centerY, CELL_SIZE * 0.175);
		this.highlightG.fill();
	}

	/**
	 * 绘制可吃子位置的提示圆环。
	 */
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
