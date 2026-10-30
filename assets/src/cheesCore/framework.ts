// core/framework.ts
import type { ChessOfPeice, PieceList } from "./piece";
import type { Move, MovePointList, PieceSide, Point, CheckPoint } from "./types";

export interface ChessGameHost {
	readonly currentLivePieceList: PieceList;
	readonly currentGameSide: PieceSide | null;
	readonly winnerSide: PieceSide | null;
	readonly duration: number;
	setLivePieceList(pl: PieceList): void;
	setPenCodeList(penCode: string): void;
	getCurrentPenCode(side: PieceSide): string;
	generateLegalMoves(side: PieceSide): Move[];
	generateMoves(side: PieceSide): MovePointList[];
	isLegalMove(side: PieceSide, from: Point, to: Point): boolean;
	getPiecesOfSide(side: PieceSide): PieceList;
	exportTextBoard(options?: TextBoardOptions): string;
	gameStart(side: PieceSide): void;
	use(plugin: ChessPlugin): this;
	unuse(name: string): this;
}

export interface VariantAfterMoveContext {
	side: PieceSide;
	from: Point;
	to: Point;
	checkpoint: CheckPoint;
	captured: ChessOfPeice | null;
	moved: ChessOfPeice;
	enemyInTrouble: boolean;
	isOver: boolean;
}

export interface ChessVariant {
	name: string;
	initBoard?(game: ChessGameHost): void;
	beforeMove?(from: Point, to: Point, side: PieceSide, game: ChessGameHost): boolean | string | void;
	filterMoves?(side: PieceSide, moves: Move[], game: ChessGameHost): Move[];
	afterMove?(ctx: VariantAfterMoveContext, game: ChessGameHost): void;
	checkWinner?(game: ChessGameHost): PieceSide | null | undefined;
	getPieceDisplayName?(piece: ChessOfPeice, viewer: PieceSide | null, game: ChessGameHost): string;
}

export type TextBoardCellFormatter = (piece: ChessOfPeice | null, x: number, y: number) => string | undefined;

export interface TextBoardOptions {
	style?: "ascii" | "chinese";
	emptyCell?: string;
	showCoords?: boolean;
	formatCell?: TextBoardCellFormatter;
	viewer?: PieceSide | null;
	resolveDisplayName?: (piece: ChessOfPeice) => string;
}

export interface ChessPlugin {
	name: string;
	install?(game: ChessGameHost): void;
	uninstall?(game: ChessGameHost): void;
	variant?: ChessVariant;
	formatCell?: TextBoardCellFormatter;
}

const asciiLetterByPieceName: Record<string, string> = {
	车: "r",
	車: "r",
	马: "n",
	馬: "n",
	相: "b",
	象: "b",
	仕: "a",
	士: "a",
	帅: "k",
	将: "k",
	炮: "c",
	砲: "c",
	兵: "p",
	卒: "p",
};

function defaultChineseCell(piece: ChessOfPeice | null, emptyCell: string): string {
	if (!piece) return emptyCell;
	return piece.name;
}

function defaultAsciiCell(piece: ChessOfPeice | null, emptyCell: string): string {
	if (!piece) return emptyCell;
	const letter = asciiLetterByPieceName[piece.name];
	if (!letter) return "?";
	return piece.side === "RED" ? letter.toUpperCase() : letter;
}

export function exportTextBoard(pieces: PieceList, options?: TextBoardOptions): string {
	const style = options?.style ?? "chinese";
	const emptyCell = options?.emptyCell ?? (style === "ascii" ? "." : "·");
	const showCoords = options?.showCoords !== false;
	const formatCell = options?.formatCell;
	const resolveDisplayName = options?.resolveDisplayName;

	const board: Array<ChessOfPeice | null> = new Array(90).fill(null);
	for (let i = 0; i < pieces.length; i++) {
		const p = pieces[i];
		if (p.x >= 0 && p.x <= 8 && p.y >= 0 && p.y <= 9) board[p.x + p.y * 9] = p;
	}

	const lines: string[] = [];
	if (showCoords) lines.push("  " + [0, 1, 2, 3, 4, 5, 6, 7, 8].join(" "));

	for (let y = 9; y >= 0; y--) {
		const cells: string[] = [];
		for (let x = 0; x <= 8; x++) {
			const piece = board[x + y * 9];
			let cell: string | undefined;
			if (formatCell) cell = formatCell(piece, x, y);
			if (cell === undefined) {
				if (piece && resolveDisplayName) {
					const display = resolveDisplayName(piece);
					if (style === "ascii") {
						const letter = asciiLetterByPieceName[display];
						cell = letter ? (piece.side === "RED" ? letter.toUpperCase() : letter) : display;
					} else cell = display;
				} else if (style === "ascii") {
					cell = defaultAsciiCell(piece, emptyCell);
				} else {
					cell = defaultChineseCell(piece, emptyCell);
				}
			}
			cells.push(cell);
		}
		const row = cells.join(" ");
		lines.push(showCoords ? `${y} ${row}` : row);
	}
	return lines.join("\n");
}

export function chainFormatCells(formatters: Array<TextBoardCellFormatter | undefined>): TextBoardCellFormatter | undefined {
	const list = formatters.filter((f): f is TextBoardCellFormatter => typeof f === "function");
	if (!list.length) return undefined;
	return (piece, x, y) => {
		for (let i = 0; i < list.length; i++) {
			const v = list[i](piece, x, y);
			if (v !== undefined) return v;
		}
		return undefined;
	};
}

export { asciiLetterByPieceName };
