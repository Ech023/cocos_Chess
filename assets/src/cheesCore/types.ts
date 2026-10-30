// core/types.ts
import type { ChessOfPeiceName, ChessOfPeice } from "./piece";

export type PieceSide = "RED" | "BLACK";
export type PieceSideCN = "红方" | "黑方";
export type PieceSideMap = { [prop in PieceSide]: PieceSideCN };
export const pieceSideMap: PieceSideMap = { RED: "红方", BLACK: "黑方" };
export const peiceSideMap: PieceSideMap = pieceSideMap;

export interface PieceInfo {
	x: number;
	y: number;
	name: ChessOfPeiceName;
	side: PieceSide;
	isChoose?: boolean;
	isLastMove: boolean;
}

export type SquarePoints = [Point, Point, Point, Point];

export class Point {
	x: number;
	y: number;
	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}
	toString() {
		return `(${this.x},${this.y})`;
	}
}

export class MovePoint extends Point {
	disPoint: Point;
	constructor(x: number, y: number, p: Point) {
		super(x, y);
		this.disPoint = new Point(p.x, p.y);
	}
	toString() {
		const hasDisPoint = !(this.disPoint.x === 10 && this.disPoint.y === 10);
		return `(${this.x},${this.y})${hasDisPoint ? "<阻碍点" + this.disPoint + ">" : ""}`;
	}
}

export type MovePointList = Array<MovePoint>;

export type Move = {
	from: Point;
	to: Point;
	captured: ChessOfPeice | null;
};

export type MoveSuccess = { flag: true };
export type MoveFail = { flag: false; message: string };
export type MoveResult = MoveSuccess | MoveFail;

export type Mp = { move: Point };
export type Ep = { eat: Point };
export type CheckPoint = Mp | Ep;

export type GameState = "INIT" | "START" | "OVER" | "MOVE";

export type MoveCallback = (pos: ChessOfPeice, cp: CheckPoint, enemyhasTrouble: boolean, penCode: string) => void;
export type MoveFailCallback = (pos: Point | null, mov: Point | null, msg: string) => void;
export type GameLogCallback = (str: any) => void;
export type GameOverCallback = (winnerSide: PieceSide) => void;
export type GameErrorCallback = (error: any) => void;

export type GameEventName = "move" | "moveFail" | "log" | "over" | "error";
export type GameEventMap = {
	move: MoveCallback;
	moveFail: MoveFailCallback;
	log: GameLogCallback;
	over: GameOverCallback;
	error: GameErrorCallback;
};
export type GameEventCallback = GameEventMap[GameEventName];

export type GamePieceGridDiffX = 8 | 0;
export type GamePeiceGridDiffX = GamePieceGridDiffX;
export type GamePieceGridDiffY = 9 | 0;
export type GamePeiceGridDiffY = GamePieceGridDiffY;

export type PENPieceNameCode = "K" | "A" | "B" | "N" | "R" | "C" | "P" | "k" | "a" | "b" | "n" | "r" | "c" | "p";
export type PENPeiceNameCode = PENPieceNameCode;

export type ParsePENStrData = {
	side: PieceSide;
	notEatRound?: string;
	round?: string;
	list: Array<PiecePosInfo>;
};

export type PiecePosInfo = {
	side: PieceSide;
	name: ChessOfPeiceName;
	x: number;
	y: number;
	isLastMove: boolean;
};
export type PeicePosInfo = PiecePosInfo;

export type UpdateResult = UpdateFail | UpdateSuccess;
export type UpdateFail = { flag: false; message: string };
export type UpdateSuccess = {
	flag: true;
	move: boolean;
	cb?: () => void;
};
export type updateSuccess = UpdateSuccess;
export type UpdateMoveCallback = (posPeice: ChessOfPeice, newPoint: Point) => void;
