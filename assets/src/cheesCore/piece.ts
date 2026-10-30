// core/piece.ts
import { PieceInfo, PieceSide, Point, MovePoint, MoveResult, MovePointList, PiecePosInfo } from "./types";

const notExistPoint = { x: 10, y: 10 };

export type Board = Array<ChessOfPeice | undefined>;

export const buildBoardIndex = (pl: PieceList): Board => {
	const board: Board = new Array(90);
	for (let i = 0; i < pl.length; i++) {
		const item = pl[i];
		board[item.x + item.y * 9] = item;
	}
	return board;
};

export const posIdx = (x: number, y: number): number => (x < 0 || x > 8 || y < 0 || y > 9 ? -1 : x + y * 9);

export class Piece implements PieceInfo {
	x: number;
	y: number;
	name: ChessOfPeiceName;
	side: PieceSide;
	isChoose: boolean;
	isLastMove: boolean;

	constructor(pieceInfo: PieceInfo) {
		this.x = pieceInfo.x;
		this.y = pieceInfo.y;
		this.name = pieceInfo.name;
		this.side = pieceInfo.side;
		this.isChoose = pieceInfo.isChoose || false;
		this.isLastMove = pieceInfo.isLastMove;
	}

	toString() {
		return `[${this.side}方]:${this.name}(${this.x},${this.y})`;
	}

	filterMovePoints(list: MovePointList, pl: PieceList, board?: Board): MovePointList {
		const b = board || buildBoardIndex(pl);
		return list.filter(i => {
			if (i.x < 0 || i.x > 8 || i.y < 0 || i.y > 9) return false;
			const atItem = b[posIdx(i.x, i.y)];
			if (atItem && atItem.side === this.side) return false;
			return true;
		});
	}

	getCurrentInfo(): PiecePosInfo {
		return {
			side: this.side,
			name: this.name,
			x: this.x,
			y: this.y,
			isLastMove: this.isLastMove,
		};
	}

	update(p: Point) {
		this.x = p.x;
		this.y = p.y;
	}

	getMovePoints(_pl: PieceList, _board?: Board): MovePointList {
		return [];
	}

	getPoint() {
		return new Point(this.x, this.y);
	}
}

// ===================== 车 =====================
export class RookPiece extends Piece {
	getMoveObstaclePieceList(p: Point | MovePoint, pieceList: PieceList): PieceList {
		const diffKey = this.x === p.x ? "y" : "x";
		const key = diffKey === "x" ? "y" : "x";
		const diff = this[diffKey] - p[diffKey];
		const min = diff > 0 ? p[diffKey] : this[diffKey];
		const max = diff < 0 ? p[diffKey] : this[diffKey];
		return pieceList.filter(item => {
			const notSelf = !(this.x === item.x && this.y === item.y);
			const isOnSameLine = item[key] === p[key];
			const inRangeY = item[diffKey] > min && item[diffKey] < max;
			const isSameSide = item.side === this.side;
			const inSameRangeY = item[diffKey] >= min && item[diffKey] <= max;
			return (isOnSameLine && notSelf && inRangeY) || (isOnSameLine && notSelf && isSameSide && inSameRangeY);
		});
	}

	move(p: Point | MovePoint, pieceList: PieceList): MoveResult {
		if (p.x < 0 || p.x > 8 || p.y < 0 || p.y > 9) {
			return { flag: false, message: "移动位置不符合规则" };
		}
		if (this.y === p.y || this.x === p.x) {
			const list = this.getMoveObstaclePieceList(p, pieceList);
			if (list.length > 0) {
				return { flag: false, message: "移动距离中存在障碍物：" + list.join("---") };
			}
			return { flag: true };
		}
		return { flag: false, message: "移动位置不符合规则" };
	}

	getMovePoints(pl: PieceList, board?: Board): MovePointList {
		const xpoints: MovePointList = [];
		const ypoints: MovePointList = [];
		if (!pl) {
			for (let x = 0; x < 9; x++) if (x !== this.x) xpoints.push(new MovePoint(x, this.y, notExistPoint));
			for (let y = 0; y < 10; y++) if (y !== this.y) ypoints.push(new MovePoint(this.x, y, notExistPoint));
			return xpoints.concat(ypoints);
		}
		const b = board || buildBoardIndex(pl);
		for (let x = this.x - 1; x >= 0; x--) {
			const pc = b[x + this.y * 9];
			if (!pc) xpoints.push(new MovePoint(x, this.y, notExistPoint));
			else {
				if (pc.side !== this.side) xpoints.push(new MovePoint(x, this.y, notExistPoint));
				break;
			}
		}
		for (let x = this.x + 1; x < 9; x++) {
			const pc = b[x + this.y * 9];
			if (!pc) xpoints.push(new MovePoint(x, this.y, notExistPoint));
			else {
				if (pc.side !== this.side) xpoints.push(new MovePoint(x, this.y, notExistPoint));
				break;
			}
		}
		for (let y = this.y - 1; y >= 0; y--) {
			const pc = b[this.x + y * 9];
			if (!pc) ypoints.push(new MovePoint(this.x, y, notExistPoint));
			else {
				if (pc.side !== this.side) ypoints.push(new MovePoint(this.x, y, notExistPoint));
				break;
			}
		}
		for (let y = this.y + 1; y < 10; y++) {
			const pc = b[this.x + y * 9];
			if (!pc) ypoints.push(new MovePoint(this.x, y, notExistPoint));
			else {
				if (pc.side !== this.side) ypoints.push(new MovePoint(this.x, y, notExistPoint));
				break;
			}
		}
		xpoints.sort((a, b) => a.x - b.x);
		ypoints.sort((a, b) => a.y - b.y);
		return xpoints.concat(ypoints);
	}
}

// ===================== 马 =====================
export class HorsePiece extends Piece {
	getMovePoints(pl: PieceList, board?: Board): MovePointList {
		const mps: MovePointList = [];
		for (let index = 0; index < 2; index++) {
			const lx = this.x - 2;
			const ly = index * 2 + (this.y - 1);
			mps.push(new MovePoint(lx, ly, { x: this.x - 1, y: this.y }));
			const rx = this.x + 2;
			const ry = ly;
			mps.push(new MovePoint(rx, ry, { x: this.x + 1, y: this.y }));
			const tx = index * 2 + (this.x - 1);
			const ty = this.y - 2;
			mps.push(new MovePoint(tx, ty, { x: this.x, y: this.y - 1 }));
			const bx = tx;
			const by = this.y + 2;
			mps.push(new MovePoint(bx, by, { x: this.x, y: this.y + 1 }));
		}
		return this.filterMovePoints(mps, pl, board);
	}

	filterMovePoints(list: MovePointList, pl: PieceList, board?: Board): MovePointList {
		const b = board || buildBoardIndex(pl);
		const result: MovePointList = [];
		for (let i = 0; i < list.length; i++) {
			const item = list[i];
			if (item.x < 0 || item.x > 8 || item.y < 0 || item.y > 9) continue;
			const atItem = b[posIdx(item.x, item.y)];
			if (atItem && atItem.side === this.side) continue;
			if (b[posIdx(item.disPoint.x, item.disPoint.y)]) continue;
			result.push(item);
		}
		return result;
	}

	move(p: Point, pieceList: PieceList): MoveResult {
		const mps = this.getMovePoints(pieceList);
		const mp = mps.find(i => p.x === i.x && p.y === i.y);
		if (!mp) return { flag: false, message: `${this}走法错误，不可以落在${p}上` };
		const hasPeice = pieceList.find(i => i.x === mp.disPoint.x && i.y === mp.disPoint.y);
		if (hasPeice) {
			return { flag: false, message: `${this}走法错误，${hasPeice}卡住了${this.name}的去向` };
		}
		return { flag: true };
	}
}

// ===================== 象 =====================
export class ElephantPiece extends HorsePiece {
	getMovePoints(pl: PieceList, board?: Board): MovePointList {
		const mps: MovePointList = [];
		for (let index = 0; index < 2; index++) {
			const tx = this.x - 2 + index * 4;
			const ty = this.y - 2;
			const tdx = this.x - 1 + index * 2;
			const tdy = this.y - 1;
			mps.push(new MovePoint(tx, ty, { x: tdx, y: tdy }));
			const bx = this.x - 2 + index * 4;
			const by = this.y + 2;
			const bdx = tdx;
			const bdy = this.y + 1;
			mps.push(new MovePoint(bx, by, { x: bdx, y: bdy }));
		}
		return this.filterMovePoints(mps, pl, board);
	}

	filterMovePoints(list: MovePointList, pl: PieceList, board?: Board) {
		const b = board || buildBoardIndex(pl);
		const result: MovePointList = [];
		const minY = this.side === "RED" ? 5 : 0;
		const maxY = this.side === "RED" ? 9 : 4;
		for (let i = 0; i < list.length; i++) {
			const item = list[i];
			if (item.x < 0 || item.x > 8 || item.y < 0 || item.y > 9) continue;
			if (item.y < minY || item.y > maxY) continue;
			const atItem = b[posIdx(item.x, item.y)];
			if (atItem && atItem.side === this.side) continue;
			if (b[posIdx(item.disPoint.x, item.disPoint.y)]) continue;
			result.push(item);
		}
		return result;
	}
}

// ===================== 士 =====================
export class KnightPiece extends ElephantPiece {
	getMovePoints(pl: PieceList, board?: Board): MovePointList {
		const mps: MovePointList = [];
		for (let index = 0; index < 2; index++) {
			const tx = this.x - 1 + index * 2;
			const ty = this.y - 1;
			mps.push(new MovePoint(tx, ty, notExistPoint));
			const bx = this.x - 1 + index * 2;
			const by = this.y + 1;
			mps.push(new MovePoint(bx, by, notExistPoint));
		}
		return this.filterMovePoints(mps, pl, board);
	}

	filterMovePoints(list: MovePointList, pl: PieceList, board?: Board) {
		const b = board || buildBoardIndex(pl);
		const result: MovePointList = [];
		const minY = this.side === "RED" ? 7 : 0;
		const maxY = this.side === "RED" ? 9 : 2;
		for (let i = 0; i < list.length; i++) {
			const item = list[i];
			if (item.x < 3 || item.x > 5) continue;
			if (item.y < minY || item.y > maxY) continue;
			const atItem = b[posIdx(item.x, item.y)];
			if (atItem && atItem.side === this.side) continue;
			result.push(item);
		}
		return result;
	}
}

// ===================== 将 =====================
export class GeneralPiece extends KnightPiece {
	getMovePoints(pl: PieceList, board?: Board): MovePointList {
		const mps: MovePointList = [
			new MovePoint(this.x - 1, this.y, notExistPoint),
			new MovePoint(this.x + 1, this.y, notExistPoint),
			new MovePoint(this.x, this.y - 1, notExistPoint),
			new MovePoint(this.x, this.y + 1, notExistPoint),
		];
		return this.filterMovePoints(mps, pl, board);
	}
}

// ===================== 炮 =====================
export class CannonPiece extends RookPiece {
	getMovePoints(pl: PieceList, board?: Board): MovePointList {
		const xpoints: MovePointList = [];
		const ypoints: MovePointList = [];
		if (!pl) {
			for (let x = 0; x < 9; x++) if (x !== this.x) xpoints.push(new MovePoint(x, this.y, notExistPoint));
			for (let y = 0; y < 10; y++) if (y !== this.y) ypoints.push(new MovePoint(this.x, y, notExistPoint));
			return xpoints.concat(ypoints);
		}
		const b = board || buildBoardIndex(pl);
		let mountX = false;
		for (let x = this.x - 1; x >= 0; x--) {
			const pc = b[x + this.y * 9];
			if (!mountX) {
				if (!pc) xpoints.push(new MovePoint(x, this.y, notExistPoint));
				else mountX = true;
			} else {
				if (pc) {
					if (pc.side !== this.side) xpoints.push(new MovePoint(x, this.y, notExistPoint));
					break;
				}
			}
		}
		mountX = false;
		for (let x = this.x + 1; x < 9; x++) {
			const pc = b[x + this.y * 9];
			if (!mountX) {
				if (!pc) xpoints.push(new MovePoint(x, this.y, notExistPoint));
				else mountX = true;
			} else {
				if (pc) {
					if (pc.side !== this.side) xpoints.push(new MovePoint(x, this.y, notExistPoint));
					break;
				}
			}
		}
		let mountY = false;
		for (let y = this.y - 1; y >= 0; y--) {
			const pc = b[this.x + y * 9];
			if (!mountY) {
				if (!pc) ypoints.push(new MovePoint(this.x, y, notExistPoint));
				else mountY = true;
			} else {
				if (pc) {
					if (pc.side !== this.side) ypoints.push(new MovePoint(this.x, y, notExistPoint));
					break;
				}
			}
		}
		mountY = false;
		for (let y = this.y + 1; y < 10; y++) {
			const pc = b[this.x + y * 9];
			if (!mountY) {
				if (!pc) ypoints.push(new MovePoint(this.x, y, notExistPoint));
				else mountY = true;
			} else {
				if (pc) {
					if (pc.side !== this.side) ypoints.push(new MovePoint(this.x, y, notExistPoint));
					break;
				}
			}
		}
		xpoints.sort((a, b) => a.x - b.x);
		ypoints.sort((a, b) => a.y - b.y);
		return xpoints.concat(ypoints);
	}

	move(p: Point, pieceList: PieceList): MoveResult {
		if (p.x < 0 || p.x > 8 || p.y < 0 || p.y > 9) {
			return { flag: false, message: "移动位置不符合规则" };
		}
		if (this.y === p.y || this.x === p.x) {
			const list = this.getMoveObstaclePieceList(p, pieceList);
			if (list.length > 1) {
				return { flag: false, message: "移动距离存在多个炮架：" + list.join("---") };
			}
			if (list.length === 1 && list[0].x === p.x && list[0].y === p.y) {
				return { flag: false, message: "无法击中敌方棋子(缺少炮架)，移动无效" };
			}
			const hasPeice = pieceList.find(i => i.x === p.x && i.y === p.y);
			if (list.length === 1) {
				if (hasPeice) return { flag: true };
				return { flag: false, message: "无法击中敌方棋子，移动无效" };
			}
			if (list.length === 0 && hasPeice) {
				return { flag: false, message: "无法击中敌方棋子(缺少炮架)，移动无效" };
			}
			return { flag: true };
		}
		return { flag: false, message: "移动位置不符合规则" };
	}
}

// ===================== 兵 =====================
export class SoldierPiece extends HorsePiece {
	getMovePoints(pl: PieceList, board?: Board): MovePointList {
		const isCross = this.side === "RED" ? this.y <= 4 : this.y >= 5;
		const step = this.side === "RED" ? -1 : +1;
		const startMp = new MovePoint(this.x, this.y + step, notExistPoint);
		const mps: MovePointList = isCross
			? [startMp, new MovePoint(this.x - 1, this.y, notExistPoint), new MovePoint(this.x + 1, this.y, notExistPoint)]
			: [startMp];
		return this.filterMovePoints(mps, pl, board);
	}
}

// ===================== 类型导出 =====================
export type ChessOfPeice = RookPiece | HorsePiece | ElephantPiece | KnightPiece | GeneralPiece | CannonPiece | SoldierPiece;

export type PieceList = Array<ChessOfPeice>;

export type ChessOfPeiceName =
	| "車"
	| "车"
	| "馬"
	| "马"
	| "象"
	| "相"
	| "仕"
	| "士"
	| "砲"
	| "炮"
	| "卒"
	| "兵"
	| "将"
	| "帅";

export type ChessOfPeiceMap = {
	[prop in ChessOfPeiceName]: (info: PieceInfo) => ChessOfPeice;
};

export const chessOfPeiceMap: ChessOfPeiceMap = {
	仕: info => new KnightPiece(info),
	兵: info => new SoldierPiece(info),
	卒: info => new SoldierPiece(info),
	士: info => new KnightPiece(info),
	将: info => new GeneralPiece(info),
	帅: info => new GeneralPiece(info),
	炮: info => new CannonPiece(info),
	相: info => new ElephantPiece(info),
	砲: info => new CannonPiece(info),
	象: info => new ElephantPiece(info),
	車: info => new RookPiece(info),
	车: info => new RookPiece(info),
	馬: info => new HorsePiece(info),
	马: info => new HorsePiece(info),
};
