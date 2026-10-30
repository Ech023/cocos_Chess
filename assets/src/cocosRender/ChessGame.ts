import {
	_decorator,
	Component,
	Node,
	Graphics,
	UITransform,
	EventTouch,
	Color,
	tween,
	v3,
	Size,
	Label,
	Layers,
	Vec3,
	UIOpacity,
	NodePool,
	log,
} from "cc";
import { ChessEngine, RenderSnapshot } from "../cheesCore/engine";
import { ChessPiece } from "./ChessPiece";
import { drawBoardLines, BoardLayout } from "./ChessBoardDrawer";
import { PieceSide, UpdateResult } from "../cheesCore/types";

const { ccclass } = _decorator;

/**
 * 中国象棋主控组件
 * 负责：初始化 UI 层级、处理点击交互、驱动引擎更新、渲染动画、对象池回收
 */
@ccclass("ChessGame")
export class ChessGame extends Component {
	// ============ 基础配置参数 ============
	private cellSize = 62; // 格子大小
	private pieceRadius = 26; // 棋子半径
	private redFirst = true; // 是否红方先手

	// ⭐ 如果需要加载特定残局或走法记录，在编辑器里填入或代码赋值
	public startPen: string = "";

	// ============ 运行时生成的 UI 节点与组件 ============
	private boardGfx!: Graphics; // 底层：棋盘线条
	private highlightGfx!: Graphics; // 中层：选中提示、可走点
	private pieceRoot!: Node; // 顶层：所有棋子
	private riverTextRoot!: Node; // 楚河汉界文字父节点

	// ============ 核心逻辑与状态 ============
	private engine!: ChessEngine; // 纯逻辑引擎
	private pieceMap = new Map<string, Node>(); // 映射表：棋格坐标 "x,y" -> 棋子节点
	private layout!: BoardLayout; // 棋盘的几何布局数据
	private playing = false; // 是否正在对局
	private toastNode: Node = null; // 当前的提示飘字节点

	// ⭐ 对象池：用于复用被吃掉的棋子节点，防止频繁创建/销毁引发卡顿
	private piecePool = new NodePool();

	// 提供外部获取引擎的接口 (用于接入 AI 或网络)
	get chessEngine(): ChessEngine {
		return this.engine;
	}

	// ============ 生命周期 ============
	onLoad() {
		this.engine = new ChessEngine();
		this.attachEvents();
		this.initUI(); // 自动创建 UI 层级
		this.node.on(Node.EventType.TOUCH_END, this.onTouch, this);
	}

	start() {
		this.computeLayout();
		this.drawBoard();
		this.gameStart();
	}

	onDestroy() {
		this.node.off(Node.EventType.TOUCH_END, this.onTouch, this);
		this.piecePool.clear(); // 场景销毁时释放对象池中的节点
	}

	/**
	 * 自动生成从底到顶的 UI 节点层级
	 */
	private initUI() {
		const rootUI = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
		rootUI.setAnchorPoint(0.5, 0.5);
		this.node.layer = Layers.Enum.UI_2D;

		// 1. 棋盘底图 (最底)
		const boardNode = new Node("BoardGfx");
		boardNode.parent = this.node;
		boardNode.layer = Layers.Enum.UI_2D;
		this.boardGfx = boardNode.addComponent(Graphics);

		// 2. 高亮提示层
		const hlNode = new Node("HighlightGfx");
		hlNode.parent = this.node;
		hlNode.layer = Layers.Enum.UI_2D;
		this.highlightGfx = hlNode.addComponent(Graphics);

		// 3. 楚河汉界文字层
		this.riverTextRoot = new Node("RiverText");
		this.riverTextRoot.parent = this.node;
		this.riverTextRoot.layer = Layers.Enum.UI_2D;

		// 4. 棋子层 (最顶)
		this.pieceRoot = new Node("PieceRoot");
		this.pieceRoot.parent = this.node;
		this.pieceRoot.layer = Layers.Enum.UI_2D;
		this.pieceRoot.addComponent(UITransform);
		this.pieceRoot.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
	}

	/**
	 * 开始一局新游戏
	 */
	gameStart(side: PieceSide = this.redFirst ? "RED" : "BLACK") {
		this.playing = true;
		this.clearPieceNodes();
		// 如果填了自定义的 PEN 字符串，就加载它，否则默认开局
		this.engine.gameStart(side, this.startPen || undefined);
		this.refresh();
	}

	/**
	 * ⭐ 悔棋接口（供 UI 按钮或键盘调用）
	 */
	public undo() {
		if (!this.playing) return;
		const success = this.engine.undo();
		if (success) {
			this.refresh();
			this.showToast("悔棋成功");
		} else {
			this.showToast("没有可以悔的棋了！");
		}
	}

	/**
	 * 计算棋盘的几何中心，设置根节点的点击区域大小
	 */
	private computeLayout() {
		const boardW = 8 * this.cellSize;
		const boardH = 9 * this.cellSize;
		this.layout = {
			left: -boardW / 2,
			top: boardH / 2,
			cellSize: this.cellSize,
		};
		const ui = this.node.getComponent(UITransform)!;
		ui.setContentSize(new Size(boardW + this.cellSize * 2, boardH + this.cellSize * 2));
	}

	/**
	 * 坐标转换：棋格坐标 -> Cocos 节点局部坐标
	 */
	private gridToNode(gx: number, gy: number): Vec3 {
		return v3(this.layout.left + gx * this.layout.cellSize, this.layout.top - gy * this.layout.cellSize, 0);
	}

	/**
	 * ⭐ 核心坐标转换：将 Cocos 节点局部像素坐标 -> 转换为棋盘逻辑网格坐标
	 * 并带有“吸附容错”机制，防止点偏了也误触。
	 *
	 * @param lx 点击点在当前节点内的局部 X 坐标（像素）
	 * @param ly 点击点在当前节点内的局部 Y 坐标（像素）
	 * @returns 返回 { x: 0~8, y: 0~9 } 的网格坐标；如果点击无效（出界或偏得太多），则返回 null
	 */
	private nodeToGrid(lx: number, ly: number): { x: number; y: number } | null {
		// ==========================================
		// 第一步：数学取整，寻找最近的网格交点
		// ==========================================
		// 知识点：
		// 我们的坐标系原点 (0,0) 在棋盘正中心。
		// layout.left 是负值（例如 -248），layout.top 是正值（例如 279）。
		// 玩家点击的 lx 越靠右越大，ly 越靠上越大。
		// 但棋盘的 Y 轴是往下递增的（0 在顶部，9 在底部）。

		// 计算 x：点击位置减去棋盘左边缘，再除以格子宽度，就能得到大概的列数。
		// 使用 Math.round 四舍五入，这样即使玩家没点到正中心，也会自动找最近的列。
		const gx = Math.round((lx - this.layout.left) / this.layout.cellSize);

		// 计算 y：因为屏幕的 Y 轴是向下的，而我们原点在中心，所以用 top 减去 ly。
		// 这样算出来的 gy 也能和棋盘的逻辑 Y 轴（0~9向下递增）完全对齐。
		const gy = Math.round((this.layout.top - ly) / this.layout.cellSize);

		// ==========================================
		// 第二步：棋盘边界校验
		// ==========================================
		// 象棋棋盘是 9 列（0~8）和 10 行（0~9）。
		// 如果算出来的索引超出这个范围，说明玩家点到了棋盘外面的空白区域，直接返回 null 拦截。
		if (gx < 0 || gx > 8 || gy < 0 || gy > 9) return null;

		// ==========================================
		// 第三步：像素级吸附容错（防误触）
		// ==========================================
		// 如果只用四舍五入，玩家点到两个棋子中间的缝隙处，也会被判定为选中了其中一个。
		// 为了极致的体验，我们需要计算出这个“逻辑网格点”在屏幕上的真实中心点 (cx, cy)。
		const cx = this.layout.left + gx * this.layout.cellSize;
		const cy = this.layout.top - gy * this.layout.cellSize;

		// Math.hypot(lx - cx, ly - cy) 是计算：玩家点击的位置 (lx, ly) 到棋子真实中心点 (cx, cy) 的直线距离。
		// 如果这个距离大于半个格子的宽度 (0.5)，说明玩家点得实在太偏了（比如点在了四个棋子的正中间）。
		// 这时我们判定为无效点击，返回 null，不给玩家乱走棋的机会。
		if (Math.hypot(lx - cx, ly - cy) > this.layout.cellSize * 0.5) return null;

		// ==========================================
		// 第四步：返回成功，获取合法的网格坐标
		// ==========================================
		// 经过重重考验，这个点击完全合法且指向明确，将逻辑网格坐标交还给上层使用。
		return { x: gx, y: gy };
	}

	/**
	 * 显示从顶部滑落的全局提示文字
	 */
	private showToast(msg: string) {
		if (this.toastNode && this.toastNode.isValid) return;

		const toastNode = new Node("Toast");
		this.toastNode = toastNode;
		toastNode.layer = Layers.Enum.UI_2D;
		toastNode.parent = this.node;
		toastNode.setSiblingIndex(this.node.children.length - 1);

		const label = toastNode.addComponent(Label);
		label.string = msg;
		label.fontSize = 28;
		label.lineHeight = 28;
		label.color = new Color(255, 50, 50, 255);

		const parentTransform = this.node.parent?.getComponent(UITransform);
		const viewHeight = parentTransform ? parentTransform.height : this.node.getComponent(UITransform)?.height || 800;
		const startY = viewHeight / 2;
		const targetY = startY - viewHeight * 0.2;

		toastNode.setPosition(0, startY, 0);
		const opacity = toastNode.addComponent(UIOpacity);

		tween(toastNode)
			.to(0.4, { position: v3(0, targetY, 0) }, { easing: "backOut" })
			.start();
		tween(toastNode)
			.delay(0.8)
			.to(0.4, { position: v3(0, targetY + 50, 0) })
			.start();
		tween(opacity)
			.delay(0.8)
			.to(0.4, { opacity: 0 })
			.call(() => toastNode.destroy())
			.start();
	}

	private onTouch(e: EventTouch) {
		if (!this.playing) return;

		// ==========================================
		// 第一步：物理点击坐标 -> 屏幕/UI 坐标系
		// ==========================================
		// e 是 Cocos 的触摸/鼠标事件对象。
		// getUILocation() 会返回点击点在【UI 世界坐标系】下的绝对位置（单位：像素）。
		// 此时的原点 (0,0) 通常在屏幕左下角（或者在 Canvas 的锚点处）。
		const uiLoc = e.getUILocation();

		// 获取当前棋类游戏节点的 UITransform 组件。
		// 这个组件包含了节点的尺寸、锚点、缩放等信息，是坐标转换的核心。
		const ui = this.node.getComponent(UITransform)!;

		// ==========================================
		// 第二步：UI 坐标系 -> 当前节点的局部坐标系
		// ==========================================
		// convertToNodeSpaceAR：把刚才拿到的屏幕绝对坐标，转换成相对于【当前节点锚点】(AR = Anchor Relative) 的局部坐标。
		// 此时坐标系的原点 (0,0) 移动到了我们这个 ChessGame 节点的中心点。
		// local.x 和 local.y 是相对节点中心的偏移量。
		const local = ui.convertToNodeSpaceAR(v3(uiLoc.x, uiLoc.y, 0));

		// ==========================================
		// 第三步：局部坐标 -> 棋盘逻辑网格坐标
		// ==========================================
		// nodeToGrid 是我们自己封装的核心数学方法。
		// 它负责把像素级别的 local.x 和 local.y 除以格子大小（cellSize），并四舍五入，映射到棋盘的网格阵列中。
		// 内部还会做两件事：
		// 1. 边界判定：如果算出来的 x 不在 0~8 之间，或者 y 不在 0~9 之间，返回 null。
		// 2. 吸附容错（Math.hypot）：判断点击点是否距离交叉点中心超过半个格子。如果点偏了（点在格子正中间），也会返回 null。
		const grid = this.nodeToGrid(local.x, local.y);

		// 如果 grid 为 null，说明玩家点到了棋盘外面，或者点得太歪没有对准交叉点。
		// 直接 return 拦截，不往下执行任何逻辑。
		if (!grid) return;

		// ==========================================
		// 第四步：获取引擎快照，分析当前局面
		// ==========================================
		// 从纯逻辑引擎获取当前时刻的“快照”。
		// 这个快照包含了：所有存活棋子的坐标/阵营、当前轮到谁下棋（currentSide）、当前选中的棋子等。
		// 这种“快照模式”让视图层和逻辑层彻底解耦，渲染层完全不需要去管引擎内部有多复杂。
		const snap = this.engine.getRenderSnapshot();

		// 提取当前走棋方（"RED" 或 "BLACK"）。
		// 用于后续判断玩家点的是不是自己的棋子。
		const side = snap.currentSide;

		// ==========================================
		// 第五步：识别点击目标（空 vs 敌 vs 我）
		// ==========================================
		// 在快照的棋子数组中，查找有没有棋子的坐标正好等于我们刚刚算出的网格坐标 (grid.x, grid.y)。
		// 如果找到了，clickedPiece 就是那个棋子对象；如果没找到，clickedPiece 就是 undefined。
		const clickedPiece = snap.pieces.find(p => p.x === grid.x && p.y === grid.y);

		// 判断点击到的棋子的阵营是否与当前走棋方相同。
		// clickedPiece && 是先决条件：如果点的是空地（没棋子），clickedPiece 是空的，后面的 .side 会报错。
		// 因此，只有当棋盘格上有棋子，且棋子的 side === 当前走棋方 side 时，才返回 true（代表点了自己的子）。
		const isClickOwnPiece = clickedPiece && clickedPiece.side === side;
		let res: UpdateResult | null = null;

		if (isClickOwnPiece) {
			// ⭐ 判断：如果当前点击的刚好是已经选中的那个棋子
			if (snap.selectedPiece && snap.selectedPiece.x === grid.x && snap.selectedPiece.y === grid.y) {
				// 同时传入起点和终点，触发引擎的“取消选中”逻辑
				res = this.engine.update(grid, grid, side);
			} else {
				// 选中新棋子
				res = this.engine.update(grid, null, side);
			}
		} else {
			// 点击了空地或敌方棋子
			if (snap.selectedPiece) {
				const from = snap.selectedPiece;
				res = this.engine.update({ x: from.x, y: from.y }, grid, side);
			} else if (clickedPiece) {
				this.showToast("请先选择己方棋子！");
			}
		}
		if (res != null && res.flag == false) {
			res.message.includes("送将") && this.showToast(res.message);
		}
		// 每次操作完刷新 UI
		this.refresh();
	}

	/**
	 * 绘制静态底图与楚河汉界
	 */
	private drawBoard() {
		if (this.boardGfx) drawBoardLines(this.boardGfx, this.layout);
		this.drawRivers();
	}

	private drawRivers() {
		const midY = this.layout.top - 4.5 * this.cellSize;
		const fontSize = Math.floor(this.cellSize * 0.8);

		const createText = (text: string, x: number) => {
			const n = new Node("text");
			n.parent = this.riverTextRoot;
			n.layer = Layers.Enum.UI_2D;
			const lbl = n.addComponent(Label);
			lbl.string = text;
			lbl.fontSize = fontSize;
			lbl.lineHeight = fontSize;
			lbl.color = new Color(40, 30, 20, 255);
			lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
			lbl.verticalAlign = Label.VerticalAlign.CENTER;
			n.setPosition(x, midY);
		};

		createText("楚 河", this.layout.left + 2 * this.cellSize);
		createText("汉 界", this.layout.left + 6 * this.cellSize);
	}

	/**
	 * 核心渲染方法：根据引擎快照刷新视图
	 */
	private refresh() {
		const snap = this.engine.getRenderSnapshot();
		this.syncPieces(snap);
		this.drawHighlights(snap);
	}

	/**
	 * ⭐ 辅助方法：从对象池获取或新建一个棋子节点
	 */
	private getPieceNode(): Node {
		let node = this.piecePool.get();
		if (!node) {
			node = new Node("Piece");
			node.layer = Layers.Enum.UI_2D;
			node.addComponent(UITransform);
			node.addComponent(ChessPiece);
		} else {
			// 重置可能残留的动画状态
			node.setScale(1, 1, 1);
			node.angle = 0;
			const op = node.getComponent(UIOpacity);
			if (op) op.opacity = 255;
		}
		node.parent = this.pieceRoot;
		return node;
	}

	/**
	 * ⭐ 辅助方法：将不再使用的棋子节点回收进对象池
	 */
	private putPieceNode(node: Node) {
		node.removeFromParent();
		this.piecePool.put(node);
	}

	/**
	 * 同步棋子节点（使用对象池优化）
	 */
	private syncPieces(snap: RenderSnapshot) {
		const seen = new Set<string>();
		for (const p of snap.pieces) {
			const key = `${p.x},${p.y}`;
			seen.add(key);

			let node = this.pieceMap.get(key);
			if (!node) {
				node = this.getPieceNode();
				node.name = `Piece_${p.side}_${p.name}`;
				node.setPosition(this.gridToNode(p.x, p.y));
				this.pieceMap.set(key, node);
			}
			const view = node.getComponent(ChessPiece);
			if (view) view.render(p, this.pieceRadius);
		}

		// 清理已被吃掉的棋子节点（放入对象池）
		for (const [key, node] of this.pieceMap) {
			if (!seen.has(key)) {
				this.putPieceNode(node);
				this.pieceMap.delete(key);
			}
		}
	}

	/**
	 * 绘制高亮与提示（绿点、红准星、黄圈）
	 */
	private drawHighlights(snap: RenderSnapshot) {
		const g = this.highlightGfx;
		if (!g) return;
		g.clear();

		const pieceSideMap = new Map<string, string>();
		for (const p of snap.pieces) pieceSideMap.set(`${p.x},${p.y}`, p.side);

		// 1. 绘制选中棋子的可走点 / 吃子准星
		if (snap.movePoints.length) {
			for (const mp of snap.movePoints) {
				const targetSide = pieceSideMap.get(`${mp.x},${mp.y}`);
				const p = this.gridToNode(mp.x, mp.y);

				if (targetSide && targetSide !== snap.currentSide) {
					// 落点有敌子：画红色准星
					this.drawTargetCross(g, p.x, p.y, this.pieceRadius + 2.5);
				} else {
					// 落点为空：画绿色小圆点
					g.fillColor = new Color(37, 221, 42, 200);
					g.circle(p.x, p.y, this.pieceRadius * 0.35);
					g.fill();
				}
			}
		}

		// 2. 绘制上一步落点（只有未选中棋子时才显示黄圈）
		if (snap.lastMovePoint && !snap.selectedPiece) {
			const p = this.gridToNode(snap.lastMovePoint.x, snap.lastMovePoint.y);
			g.fillColor = new Color(255, 200, 60, 110);
			g.circle(p.x, p.y, this.pieceRadius * 0.85);
			g.fill();
		}
	}

	/**
	 * 辅助绘制：吃子准星
	 */
	private drawTargetCross(g: Graphics, x: number, y: number, r: number) {
		g.lineWidth = 5;
		g.strokeColor = new Color(34, 0, 0, 255);

		g.circle(x, y, r);
		g.stroke();

		const markLen = r * 0.8;
		g.moveTo(x - r, y);
		g.lineTo(x - r + markLen, y);
		g.moveTo(x + r, y);
		g.lineTo(x + r - markLen, y);
		g.moveTo(x, y - r);
		g.lineTo(x, y - r + markLen);
		g.moveTo(x, y + r);
		g.lineTo(x, y + r - markLen);
		g.stroke();
	}

	/**
	 * 清空当前棋盘上的棋子节点（重开或悔棋时调用）
	 */
	private clearPieceNodes() {
		for (const [, n] of this.pieceMap) {
			this.putPieceNode(n);
		}
		this.pieceMap.clear();
	}

	/**
	 * 监听引擎事件，处理走子与吃子动画
	 */
	private attachEvents() {
		this.engine.on("move", (piece, cp) => {
			const from = (this.engine as any).lastMoveFrom as { x: number; y: number } | undefined;
			if (from) {
				const to = "move" in cp ? cp.move : cp.eat;
				this.playMoveAnimation(from, to);
			} else {
				this.refresh();
			}
			log(this.engine.history);
		});
		this.engine.on("log", (...args: any[]) => {
			log("【log】", ...args);
		});

		this.engine.on("error", (...args: any[]) => {
			log("【error】", ...args);
		});

		this.engine.on("moveFail", (...args: any[]) => {
			log("【moveFail】", ...args);
		});

		this.engine.on("over", (...args: any[]) => {
			log("【over】", ...args);
			this.showToast(`${args[0] == "RED" ? "红方" : "黑方"}绝杀`);
			this.playing = false;
		});
	}

	/**
	 * 播放走子与吃子动画
	 */
	private playMoveAnimation(from: { x: number; y: number }, to: { x: number; y: number }) {
		const fromKey = `${from.x},${from.y}`;
		const toKey = `${to.x},${to.y}`;

		const movingNode = this.pieceMap.get(fromKey);
		const eatenNode = this.pieceMap.get(toKey);

		// 如果落点有敌子，触发被吃动画，动画结束后回收进对象池
		if (eatenNode && eatenNode !== movingNode) {
			this.pieceMap.delete(toKey);
			const eatenView = eatenNode.getComponent(ChessPiece);
			if (eatenView) {
				eatenView.playEatAnimation(() => {
					this.putPieceNode(eatenNode);
				});
			} else {
				this.putPieceNode(eatenNode);
			}
		}

		this.pieceMap.delete(fromKey);
		if (!movingNode) {
			this.refresh();
			return;
		}
		this.pieceMap.set(toKey, movingNode);

		// 平滑移动到目标位置
		movingNode.setPosition(this.gridToNode(from.x, from.y));
		tween(movingNode)
			.to(0.12, { position: this.gridToNode(to.x, to.y) })
			.call(() => this.refresh())
			.start();
	}
}
