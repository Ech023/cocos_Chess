import type {
	GameState,
	PieceSide,
	GameEventName,
	MoveCallback,
	MoveFailCallback,
	GameLogCallback,
	GameOverCallback,
	GameEventMap,
	CheckPoint,
	UpdateResult,
	Move,
	MovePointList,
	Point as IPoint,
} from "./types";
import { Point, MoveResult } from "./types";
import { ChessOfPeice, PieceList, buildBoardIndex, posIdx, chessOfPeiceMap } from "./piece";
import { initBoardPen, parse_PEN_Str, gen_PEN_Str, parseStrToPoint } from "./pen";
import { checkGeneralInTrouble, checkEnemySideInTroubleHasSolution, checkEnemySideHasMovePoints } from "./board-rules";
import type { ChessGameHost, ChessPlugin, ChessVariant, VariantAfterMoveContext, TextBoardOptions } from "./framework";
import { chainFormatCells, exportTextBoard as formatTextBoard } from "./framework";

const findPiece = (pl: PieceList, p: IPoint) => pl.find(item => item.x === p.x && item.y === p.y);

// ============ 供 Cocos 渲染层消费的快照接口 ============
export interface PieceSnapshot {
	x: number;
	y: number;
	side: PieceSide;
	name: string;
	displayName: string;
	isChoose: boolean;
	isLastMove: boolean;
}

export interface MovePointSnapshot {
	x: number;
	y: number;
}

export interface RenderSnapshot {
	pieces: PieceSnapshot[];
	movePoints: MovePointSnapshot[];
	lastMovePoint: IPoint | null;
	selectedPiece: PieceSnapshot | null;
	currentSide: PieceSide;
	gameState: GameState;
	winner: PieceSide | null;
	lastMoveFrom: IPoint | null;
}

export interface EngineConfig {
	variant?: ChessVariant;
	plugins?: ChessPlugin[];
	duration?: number;
}

/**
 * 核心引擎类
 */
export class ChessEngine implements ChessGameHost {
	// ============ 核心状态 ============
	protected currentSide!: PieceSide;
	protected livePieceList!: PieceList;
	protected choosePiece!: ChessOfPeice | null;
	protected gameState!: GameState;
	protected winner: PieceSide | null = null;
	protected gameSide: PieceSide | null = null;
	protected lastMovePoint: Point | undefined;
	protected lastMovePiece: ChessOfPeice | undefined;
	protected lastMoveFrom: Point | undefined;

	protected variant: ChessVariant | undefined;
	protected baseVariant: ChessVariant | undefined;
	protected plugins: ChessPlugin[] = [];

	// ============ 悔棋与复盘历史栈 ============
	public history: Array<{
		pen: string;
		lastMovePoint: Point | undefined;
		lastMoveFrom: Point | undefined;
	}> = [];

	public moveHistory: string[] = [];
	public initialPen: string = initBoardPen;

	// ============ 事件系统 ============
	protected moveEvents: MoveCallback[] = [];
	protected moveFailEvents: MoveFailCallback[] = [];
	protected logEvents: GameLogCallback[] = [];
	protected overEvents: GameOverCallback[] = [];
	protected errorEvents: ((e: any) => void)[] = [];

	public readonly duration: number;

	constructor(config?: EngineConfig) {
		this.duration = config?.duration ?? 200;
		this.currentSide = "RED";
		this.choosePiece = null;
		this.livePieceList = [];
		this.gameState = "INIT";

		if (config?.variant) {
			this.baseVariant = config.variant;
			this.variant = config.variant;
		}
		if (config?.plugins && config.plugins.length) {
			for (const p of config.plugins) this.use(p);
		}
	}

	// ============ 生命周期 ============

	gameStart(side: PieceSide, customPen?: string) {
		this.currentSide = "RED";
		this.choosePiece = null;
		this.livePieceList = [];
		this.gameState = "START";
		this.winner = null;
		this.lastMovePoint = undefined;
		this.lastMovePiece = undefined;
		this.lastMoveFrom = undefined;
		this.gameSide = side;
		this.history = [];
		this.moveHistory = [];

		if (customPen) {
			this.loadPenWithMoves(customPen);
		} else if (this.variant?.initBoard) {
			this.variant.initBoard(this);
			this.initialPen = this.getCurrentPenCode(side);
		} else {
			this.initialPen = initBoardPen;
			this.setPenCodeList(initBoardPen);
		}
		this.choosePiece = null;
	}

	/**
	 * 加载包含历史走法的 PEN 字符串
	 */
	public loadPenWithMoves(penStr: string) {
		// 1. 分离局面和走法记录
		const parts = penStr.split(/\s+moves\s+/);
		const penCode = parts[0].trim();
		this.initialPen = penCode; // ⭐ 准确记录初始盘面
		const movesStr = parts[1];

		// 2. 加载初始局面
		this.setPenCodeList(penCode);

		// 3. 模拟历史走法
		if (movesStr) {
			const moves = movesStr.trim().split(/\s+/);
			for (const m of moves) {
				if (m.length === 4) {
					const fromX = m.charCodeAt(0) - 97;
					const fromY = 9 - parseInt(m[1]);
					const toX = m.charCodeAt(2) - 97;
					const toY = 9 - parseInt(m[3]);
					// 静默推演，不触发外部渲染事件
					this.update({ x: fromX, y: fromY }, { x: toX, y: toY }, this.currentSide, true);
				}
			}
		}
	}

	// ============ 核心流程：走子与悔棋 ============

	update(pos: IPoint, mov: IPoint | null, side: PieceSide, post = true): UpdateResult {
		const checkData = this.checkGameState();
		if (!checkData.flag) return { flag: false, message: checkData?.message };
		if (this.currentSide !== side) return { flag: false, message: "请等待对方下棋" };

		const posPeice = findPiece(this.livePieceList, pos);
		if (!posPeice) return { flag: false, message: "未找到棋子" };
		if (this.currentSide !== posPeice.side) return { flag: false, message: "选中了敌方的棋子" };

		this.clearMoveChoosePeiece();
		posPeice.isChoose = true;
		this.setLastMovePeiceStatus(false);
		this.choosePiece = posPeice;

		if (!mov) {
			this.logEvents.forEach(f => f(side + "方： 选中 " + posPeice));
			return { flag: true, move: false };
		}

		const movPeice = findPiece(this.livePieceList, mov);
		const moveFlag = this.choosePiece.move(mov as Point, this.livePieceList);

		const moveCheck = (cp: CheckPoint): UpdateResult => {
			if (this.variant?.beforeMove) {
				const before = this.variant.beforeMove(pos, mov, side, this);
				if (before === false) return { flag: false, message: "变体规则不允许此走法" };
				if (typeof before === "string") return { flag: false, message: before };
			}

			const isMove = "move" in cp;
			const board = buildBoardIndex(this.livePieceList);
			const hasTrouble = checkGeneralInTrouble(side, posPeice, cp, this.livePieceList, board);
			if (hasTrouble) return { flag: false, message: "不可以送将！" };

			const enemySide: PieceSide = side === "RED" ? "BLACK" : "RED";
			let isOver = false;
			const enemyhasTrouble = checkGeneralInTrouble(enemySide, posPeice, cp, this.livePieceList, board);

			const movedPeiceList = isMove
				? this.livePieceList.filter(i => !(i.x === posPeice.x && i.y === posPeice.y))
				: this.livePieceList.filter(
						i => !((i.x === posPeice.x && i.y === posPeice.y) || (i.x === cp.eat.x && i.y === cp.eat.y)),
					);
			const newMp = chessOfPeiceMap[posPeice.name]({ ...posPeice, ...(mov as Point) });
			movedPeiceList.push(newMp);
			const movedBoard = buildBoardIndex(movedPeiceList);

			if (enemyhasTrouble) {
				const hasSolution = checkEnemySideInTroubleHasSolution(enemySide, movedPeiceList, movedBoard);
				if (!hasSolution) {
					isOver = true;
					this.winner = side;
				}
			} else {
				const hasMovePoints = checkEnemySideHasMovePoints(enemySide, movedPeiceList, movedBoard);
				if (!hasMovePoints) {
					isOver = true;
					this.winner = side;
				}
			}

			if (this.variant?.checkWinner) {
				const prevList = this.livePieceList;
				this.livePieceList = movedPeiceList;
				const customWinner = this.variant.checkWinner(this);
				this.livePieceList = prevList;
				if (customWinner === "RED" || customWinner === "BLACK") {
					isOver = true;
					this.winner = customWinner;
				}
			}

			const captured: ChessOfPeice | null = isMove ? null : movPeice || null;
			const cb = () => {
				const iccsStr = this.pointToICCS(pos, mov as Point);
				this.moveHistory.push(iccsStr);
				this.history.push({
					pen: this.initialPen + " moves " + this.moveHistory.join(" "),
					lastMovePoint: this.lastMovePoint ? new Point(this.lastMovePoint.x, this.lastMovePoint.y) : undefined,
					lastMoveFrom: this.lastMoveFrom ? new Point(this.lastMoveFrom.x, this.lastMoveFrom.y) : undefined,
				});

				const newPeice = chessOfPeiceMap[posPeice.name]({ ...posPeice, ...(pos as Point) });
				if (!isMove) {
					this.livePieceList = this.livePieceList.filter(p => !(p.x === cp.eat.x && p.y === cp.eat.y));
				}
				this.setLastMovePeiceStatus(false);
				posPeice.update(mov as Point);
				this.lastMovePiece = posPeice;
				this.setLastMovePeiceStatus(true);
				this.lastMovePoint = new Point(pos.x, pos.y);
				this.lastMoveFrom = new Point(pos.x, pos.y);
				this.gameState = isOver ? "OVER" : "START";

				this.moveEvents.forEach(f => f(newPeice, cp, isOver || enemyhasTrouble, this.getCurrentPenCode(enemySide)));

				if (this.variant?.afterMove) {
					const ctx: VariantAfterMoveContext = {
						side,
						from: new Point(pos.x, pos.y),
						to: new Point(mov.x, mov.y),
						checkpoint: cp,
						captured,
						moved: posPeice,
						enemyInTrouble: enemyhasTrouble,
						isOver,
					};
					this.variant.afterMove(ctx, this);
				}

				if (isOver) this.overEvents.forEach(f => f(this.winner || side));
				this.clearMoveChoosePeiece();
				this.changeSide();
			};

			if (post) {
				cb();
				return { flag: true, move: true };
			}
			return { flag: true, cb, move: true };
		};

		if (!movPeice) {
			if (moveFlag.flag) return moveCheck({ move: mov as Point });
			return { flag: false, message: "" };
		}

		if (movPeice.side === side) {
			if (pos.x === mov.x && pos.y === mov.y) {
				this.clearMoveChoosePeiece();
				this.setLastMovePeiceStatus(true);
				this.logEvents.forEach(f => f(side + "方： 取消选中 " + movPeice));
				return { flag: true, move: false };
			}
			this.choosePiece!.isChoose = false;
			this.choosePiece = movPeice;
			this.choosePiece.isChoose = true;
			this.logEvents.forEach(f => f(`${this.currentSide}方：切换 选中棋子 由${this.choosePiece} --> ${movPeice}`));
			return { flag: true, move: false };
		}

		this.logEvents.forEach(f =>
			f(`当前：${this.currentSide} ,棋子:${this.choosePiece} 需要移动到：${mov} 这个点上，并且要吃掉 ${movPeice}`),
		);
		if (!moveFlag.flag) return { flag: false, message: "" };
		return moveCheck({ eat: mov as Point });
	}

	/**
	 * ⭐ 悔棋
	 */
	public undo(): boolean {
		if (this.history.length === 0) return false;

		const prevState = this.history.pop()!;
		this.moveHistory.pop(); // 同步弹出走法记录
		this.setPenCodeList(prevState.pen);

		this.lastMovePoint = prevState.lastMovePoint;
		this.lastMoveFrom = prevState.lastMoveFrom;

		if (this.lastMoveFrom) {
			this.lastMovePiece = this.livePieceList.find(p => p.x === this.lastMoveFrom!.x && p.y === this.lastMoveFrom!.y);
		} else {
			this.lastMovePiece = undefined;
		}

		this.gameState = "START";
		this.winner = null;
		this.choosePiece = null;
		return true;
	}

	/**
	 * ⭐ 辅助工具：内部坐标 -> ICCS 格式 (如 x:2, y:5 => "c4")
	 */
	private pointToICCS(from: Point, to: Point): string {
		const colFrom = String.fromCharCode(from.x + 97);
		const rowFrom = (9 - from.y).toString();
		const colTo = String.fromCharCode(to.x + 97);
		const rowTo = (9 - to.y).toString();
		return `${colFrom}${rowFrom}${colTo}${rowTo}`;
	}

	// ============ 其他原有逻辑保持不变 ============

	async updateAsync(pos: IPoint, mov: IPoint | null, side: PieceSide): Promise<UpdateResult> {
		return this.update(pos, mov, side, true);
	}

	moveStr(str: string, side: PieceSide): UpdateResult {
		if (!this.checkGameState()) return { flag: false, message: "当前游戏状态不可以移动棋子" };
		this.logEvents.forEach(f => f(`当前 ${side} 输出：${str}`));
		if (this.currentSide !== side) {
			const msg = `当前为${this.currentSide}方下棋，请等待！`;
			this.logEvents.forEach(f => f(msg));
			return { flag: false, message: msg };
		}
		const res = parseStrToPoint(str, this.currentSide, this.livePieceList);
		if (!res) {
			this.logEvents.forEach(f => f("未找到棋子"));
			return { flag: false, message: "未找到棋子" };
		}
		if (this.choosePiece) this.clearMoveChoosePeiece();
		const posPeice = findPiece(this.livePieceList, res.mp);
		if (posPeice && posPeice.side === this.currentSide) {
			this.logEvents.forEach(f => f("移动的位置有己方棋子"));
			return { flag: false, message: "移动的位置有己方棋子" };
		}
		this.choosePiece = res.choose;
		this.choosePiece.isChoose = true;
		return this.update(res.choose, res.mp, side, true);
	}

	generateMoves(side: PieceSide): MovePointList[] {
		const pl = this.livePieceList;
		const b = buildBoardIndex(pl);
		const result: MovePointList[] = [];
		for (let i = 0; i < pl.length; i++) {
			const item = pl[i];
			if (item.side === side) result.push(item.getMovePoints(pl, b));
		}
		return result;
	}

	generateLegalMoves(side: PieceSide): Move[] {
		const pl = this.livePieceList;
		const b = buildBoardIndex(pl);
		const result: Move[] = [];
		for (let i = 0; i < pl.length; i++) {
			const item = pl[i];
			if (item.side !== side) continue;
			const mps = item.getMovePoints(pl, b);
			for (let j = 0; j < mps.length; j++) {
				const p = mps[j];
				const hasEat = !!b[posIdx(p.x, p.y)];
				const cp: CheckPoint = hasEat ? { eat: p } : { move: p };
				if (checkGeneralInTrouble(side, item, cp, pl, b)) continue;
				result.push({
					from: new Point(item.x, item.y),
					to: new Point(p.x, p.y),
					captured: hasEat ? (b[posIdx(p.x, p.y)] ?? null) : null,
				});
			}
		}
		if (this.variant?.filterMoves) return this.variant.filterMoves(side, result, this);
		return result;
	}

	isLegalMove(side: PieceSide, from: IPoint, to: IPoint): boolean {
		const pl = this.livePieceList;
		const item = pl.find(p => p.side === side && p.x === from.x && p.y === from.y);
		if (!item) return false;
		const b = buildBoardIndex(pl);
		const mp = item.getMovePoints(pl, b).find(p => p.x === to.x && p.y === to.y);
		if (!mp) return false;
		const hasEat = !!b[posIdx(mp.x, mp.y)];
		const cp: CheckPoint = hasEat ? { eat: mp } : { move: mp };
		if (checkGeneralInTrouble(side, item, cp, pl, b)) return false;
		if (this.variant?.filterMoves) {
			const move: Move = {
				from: new Point(from.x, from.y),
				to: new Point(to.x, to.y),
				captured: hasEat ? (b[posIdx(mp.x, mp.y)] ?? null) : null,
			};
			return this.variant
				.filterMoves(side, [move], this)
				.some(m => m.from.x === from.x && m.from.y === from.y && m.to.x === to.x && m.to.y === to.y);
		}
		return true;
	}

	getCurrentPenCode(side: PieceSide): string {
		return gen_PEN_Str(this.livePieceList, side);
	}

	setLivePieceList(pl: PieceList) {
		this.livePieceList = pl;
	}

	setPenCodeList(penCode: string) {
		const data = parse_PEN_Str(penCode);
		this.setLastMovePeiceStatus(false);
		this.clearMoveChoosePeiece();
		this.lastMovePiece = undefined;
		this.lastMovePoint = undefined;
		this.livePieceList = data.list.map(p => chessOfPeiceMap[p.name](p));
		this.currentSide = data.side;
	}

	get currentLivePieceList(): PieceList {
		return this.livePieceList.map(item => chessOfPeiceMap[item.name]({ ...item }));
	}

	getPiecesOfSide(side: PieceSide): PieceList {
		return this.livePieceList.filter(item => item.side === side).map(item => chessOfPeiceMap[item.name]({ ...item }));
	}

	get currentGameSide(): PieceSide | null {
		return this.gameSide;
	}
	get winnerSide(): PieceSide | null {
		return this.winner;
	}
	get currentGameState(): GameState {
		return this.gameState;
	}
	get currentSideValue(): PieceSide {
		return this.currentSide;
	}

	isGameOver() {
		return this.gameState === "OVER";
	}
	gameOver() {
		return this.isGameOver();
	}

	changePlaySide(_side: PieceSide) {
		this.clearMoveChoosePeiece();
	}
	changeCurrentPlaySide(side: PieceSide) {
		this.currentSide = side;
	}

	getRenderSnapshot(): RenderSnapshot {
		const pieces: PieceSnapshot[] = this.livePieceList.map(p => ({
			x: p.x,
			y: p.y,
			side: p.side,
			name: p.name,
			displayName: this.resolveDisplayName(p),
			isChoose: p === this.choosePiece,
			isLastMove: p === this.lastMovePiece,
		}));

		let movePoints: MovePointSnapshot[] = [];
		if (this.choosePiece && this.gameState !== "MOVE") {
			const b = buildBoardIndex(this.livePieceList);
			movePoints = this.choosePiece.getMovePoints(this.livePieceList, b).map(mp => ({ x: mp.x, y: mp.y }));
		}

		const selectedPiece: PieceSnapshot | null = this.choosePiece
			? {
					x: this.choosePiece.x,
					y: this.choosePiece.y,
					side: this.choosePiece.side,
					name: this.choosePiece.name,
					displayName: this.resolveDisplayName(this.choosePiece),
					isChoose: true,
					isLastMove: false,
				}
			: null;

		return {
			pieces,
			movePoints,
			lastMovePoint: this.lastMovePoint ? { x: this.lastMovePoint.x, y: this.lastMovePoint.y } : null,
			selectedPiece,
			currentSide: this.currentSide,
			gameState: this.gameState,
			winner: this.winner,
			lastMoveFrom: this.lastMoveFrom ? { x: this.lastMoveFrom.x, y: this.lastMoveFrom.y } : null,
		};
	}

	exportTextBoard(options?: TextBoardOptions): string {
		const pluginFormat = chainFormatCells(this.plugins.map(p => p.formatCell));
		const formatCell = options?.formatCell ? chainFormatCells([options.formatCell, pluginFormat]) : pluginFormat;
		return formatTextBoard(this.livePieceList, {
			...options,
			formatCell,
			resolveDisplayName: piece => this.resolveDisplayName(piece),
		});
	}

	use(plugin: ChessPlugin): this {
		if (!plugin || typeof plugin.name !== "string" || !plugin.name) {
			throw new Error("插件必须包含非空 name");
		}
		const existed = this.plugins.findIndex(p => p.name === plugin.name);
		if (existed >= 0) this.unuse(plugin.name);
		this.plugins.push(plugin);
		if (plugin.variant) this.variant = plugin.variant;
		if (plugin.install) plugin.install(this);
		return this;
	}

	unuse(name: string): this {
		const idx = this.plugins.findIndex(p => p.name === name);
		if (idx < 0) return this;
		const [plugin] = this.plugins.splice(idx, 1);
		if (plugin.uninstall) plugin.uninstall(this);
		let nextVariant = this.baseVariant;
		for (const p of this.plugins) if (p.variant) nextVariant = p.variant;
		this.variant = nextVariant;
		return this;
	}

	on<K extends GameEventName>(e: K, fn: GameEventMap[K]) {
		if (typeof fn !== "function") throw new Error("监听函数值应该为 function 类型");
		if (e === "log") this.logEvents.push(fn as GameLogCallback);
		else if (e === "move") this.moveEvents.push(fn as MoveCallback);
		else if (e === "moveFail") this.moveFailEvents.push(fn as MoveFailCallback);
		else if (e === "over") this.overEvents.push(fn as GameOverCallback);
		else if (e === "error") this.errorEvents.push(fn as any);
	}

	removeEvent<K extends GameEventName>(e: K, fn: GameEventMap[K]) {
		if (typeof fn !== "function") throw new Error("监听函数值应该为 function 类型");
		if (e === "log") this.logEvents = this.logEvents.filter(f => f !== fn);
		else if (e === "move") this.moveEvents = this.moveEvents.filter(f => f !== fn);
		else if (e === "moveFail") this.moveFailEvents = this.moveFailEvents.filter(f => f !== fn);
		else if (e === "over") this.overEvents = this.overEvents.filter(f => f !== fn);
		else if (e === "error") this.errorEvents = this.errorEvents.filter(f => f !== fn);
	}

	protected resolveDisplayName(piece: ChessOfPeice): string {
		if (this.variant?.getPieceDisplayName) {
			return this.variant.getPieceDisplayName(piece, this.gameSide, this);
		}
		return piece.name;
	}

	protected checkGameState(): MoveResult {
		let data: MoveResult;
		if (this.gameState === "INIT") data = { flag: false, message: "请选择红黑方" };
		else if (this.gameState === "OVER") data = { flag: false, message: "棋盘结束 等待重开！" };
		else if (this.gameState === "MOVE") data = { flag: false, message: "棋子正在移动，无法做任何操作" };
		else data = { flag: true };
		if (!data.flag) {
			const msg = (data as any).message;
			this.logEvents.forEach(f => f(msg));
			this.moveFailEvents.forEach(f => f(null, null, msg));
		}
		return data;
	}

	protected clearMoveChoosePeiece() {
		if (this.choosePiece) {
			this.choosePiece.isChoose = false;
			this.choosePiece = null;
		}
	}

	protected changeSide() {
		this.currentSide = this.currentSide === "RED" ? "BLACK" : "RED";
	}

	protected setLastMovePeiceStatus(status: boolean) {
		if (this.lastMovePiece) this.lastMovePiece.isLastMove = status;
	}
}
