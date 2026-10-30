// core/board-rules.ts
import {
	ChessOfPeice,
	PieceList,
	Board,
	buildBoardIndex,
	posIdx,
	GeneralPiece,
	RookPiece,
	CannonPiece,
	HorsePiece,
	SoldierPiece,
	chessOfPeiceMap,
} from "./piece";
import type { CheckPoint, PieceInfo, PieceSide } from "./types";

/**
 * 检查将帅对脸（同列且之间无子）→ true 表示危险
 */
export function checkGeneralsFaceToFaceInTrouble(board: Board): boolean {
	let g1: ChessOfPeice | undefined;
	let g2: ChessOfPeice | undefined;
	for (let i = 0; i < board.length; i++) {
		const pc = board[i];
		if (pc && pc.constructor === GeneralPiece) {
			if (!g1) g1 = pc;
			else {
				g2 = pc;
				break;
			}
		}
	}
	if (!g1 || !g2) return false;
	if (g1.x !== g2.x) return false;
	const min = Math.min(g1.y, g2.y);
	const max = Math.max(g1.y, g2.y);
	for (let y = min + 1; y < max; y++) {
		if (board[g1.x + y * 9]) return false;
	}
	return true;
}

/**
 * 判断某方走子后是否被将军（会破坏 b 中模拟状态，内部 finally 还原）
 */
export function checkGeneralInTrouble(
	side: PieceSide,
	pos: ChessOfPeice,
	cp: CheckPoint,
	pl: PieceList,
	board?: Board,
): boolean {
	const enemySide: PieceSide = side === "BLACK" ? "RED" : "BLACK";
	const isMove = "move" in cp;
	const toP = isMove ? cp.move : cp.eat;
	const b = board || buildBoardIndex(pl);
	const fromIdx = posIdx(pos.x, pos.y);
	const toIdx = posIdx(toP.x, toP.y);
	const eatIdx = isMove ? -1 : toIdx;
	const fromPiece = b[fromIdx];
	const eatPiece = eatIdx >= 0 ? b[eatIdx] : undefined;
	const pieceInfo = { ...pos, ...toP } as PieceInfo;
	const piece = chessOfPeiceMap[pieceInfo.name](pieceInfo);
	b[fromIdx] = undefined;
	if (eatIdx >= 0) b[eatIdx] = undefined;
	b[toIdx] = piece;

	try {
		if (checkGeneralsFaceToFaceInTrouble(b)) return true;

		let sideGeneralPiece: GeneralPiece | undefined;
		for (let i = 0; i < b.length; i++) {
			const pc = b[i];
			if (pc && pc.side === side && pc.constructor === GeneralPiece) {
				sideGeneralPiece = pc;
				break;
			}
		}
		if (!sideGeneralPiece) return false;

		const gx = sideGeneralPiece.x;
		const gy = sideGeneralPiece.y;
		const isEnemy = (pc: ChessOfPeice) => pc.side === enemySide;
		const isAttackLine = (pc: ChessOfPeice) =>
			(pc.constructor === RookPiece || pc.constructor === GeneralPiece) && pc.side === enemySide;
		const isCannon = (pc: ChessOfPeice) => pc.constructor === CannonPiece && pc.side === enemySide;

		// 左
		let mount = false;
		for (let x = gx - 1; x >= 0; x--) {
			const pc = b[x + gy * 9];
			if (!pc) continue;
			if (!mount) {
				if (isAttackLine(pc)) return true;
				mount = true;
			} else {
				if (isCannon(pc)) return true;
				break;
			}
		}
		// 右
		mount = false;
		for (let x = gx + 1; x <= 8; x++) {
			const pc = b[x + gy * 9];
			if (!pc) continue;
			if (!mount) {
				if (isAttackLine(pc)) return true;
				mount = true;
			} else {
				if (isCannon(pc)) return true;
				break;
			}
		}
		// 上
		mount = false;
		for (let y = gy - 1; y >= 0; y--) {
			const pc = b[gx + y * 9];
			if (!pc) continue;
			if (!mount) {
				if (isAttackLine(pc)) return true;
				mount = true;
			} else {
				if (isCannon(pc)) return true;
				break;
			}
		}
		// 下
		mount = false;
		for (let y = gy + 1; y <= 9; y++) {
			const pc = b[gx + y * 9];
			if (!pc) continue;
			if (!mount) {
				if (isAttackLine(pc)) return true;
				mount = true;
			} else {
				if (isCannon(pc)) return true;
				break;
			}
		}

		// 马
		const horseOffsets: Array<[number, number, number, number]> = [
			[1, 2, 0, 1],
			[2, 1, 1, 0],
			[2, -1, 1, 0],
			[1, -2, 0, -1],
			[-1, -2, 0, -1],
			[-2, -1, -1, 0],
			[-2, 1, -1, 0],
			[-1, 2, 0, 1],
		];
		for (let i = 0; i < 8; i++) {
			const o = horseOffsets[i];
			const hx = gx + o[0];
			const hy = gy + o[1];
			if (hx < 0 || hx > 8 || hy < 0 || hy > 9) continue;
			const horse = b[hx + hy * 9];
			if (horse && horse.side === enemySide && horse.constructor === HorsePiece && !b[gx + o[2] + (gy + o[3]) * 9])
				return true;
		}

		// 兵/卒
		if (enemySide === "BLACK") {
			const fwd = b[posIdx(gx, gy - 1)];
			if (fwd && isEnemy(fwd) && fwd.constructor === SoldierPiece) return true;
			if (gy >= 5) {
				const lf = b[posIdx(gx - 1, gy)];
				if (lf && isEnemy(lf) && lf.constructor === SoldierPiece) return true;
				const rf = b[posIdx(gx + 1, gy)];
				if (rf && isEnemy(rf) && rf.constructor === SoldierPiece) return true;
			}
		} else {
			const fwd = b[posIdx(gx, gy + 1)];
			if (fwd && isEnemy(fwd) && fwd.constructor === SoldierPiece) return true;
			if (gy <= 4) {
				const lf = b[posIdx(gx - 1, gy)];
				if (lf && isEnemy(lf) && lf.constructor === SoldierPiece) return true;
				const rf = b[posIdx(gx + 1, gy)];
				if (rf && isEnemy(rf) && rf.constructor === SoldierPiece) return true;
			}
		}
		return false;
	} finally {
		b[toIdx] = undefined;
		if (eatIdx >= 0) b[eatIdx] = eatPiece;
		b[fromIdx] = fromPiece;
	}
}

/**
 * 判断敌方被将军时是否有解
 */
export function checkEnemySideInTroubleHasSolution(enemySide: PieceSide, pl: PieceList, board?: Board): boolean {
	const b = board || buildBoardIndex(pl);
	return pl
		.filter(i => i.side === enemySide)
		.some(item => {
			const mps = item.getMovePoints(pl, b);
			return mps.some(p => {
				const hasEat = b[posIdx(p.x, p.y)];
				const checkPoint: CheckPoint = hasEat ? { eat: p } : { move: p };
				return !checkGeneralInTrouble(enemySide, item, checkPoint, pl, b);
			});
		});
}

/**
 * 判断敌方是否还有走法（无则绝杀）
 */
export function checkEnemySideHasMovePoints(enemySide: PieceSide, pl: PieceList, board?: Board): boolean {
	const b = board || buildBoardIndex(pl);
	const enemyList = pl.filter(p => p.side === enemySide);
	const hasPeice = enemyList.find(p => {
		const mps = p.getMovePoints(pl, b);
		return mps.find(mp => {
			const checkPoint: CheckPoint = b[posIdx(mp.x, mp.y)] ? { eat: mp } : { move: mp };
			return !checkGeneralInTrouble(enemySide, p, checkPoint, pl, b);
		});
	});
	return !!hasPeice;
}
