import { Chess, Move, PieceSymbol } from "./chessCore/chess";

// ============================================================
// 1. 棋子基础评估参数
// ============================================================
const WEIGHTS: Record<string, number> = { p: 100, n: 280, b: 320, r: 479, q: 929, k: 60000, k_e: 60000 };

// ============================================================
// 2. 白方棋子位置评估表
// ============================================================
const PST_W: Record<string, number[][]> = {
	p: [
		[100, 100, 100, 100, 105, 100, 100, 100],
		[78, 83, 86, 73, 102, 82, 85, 90],
		[7, 29, 21, 44, 40, 31, 44, 7],
		[-17, 16, -2, 15, 14, 0, 15, -13],
		[-26, 3, 10, 9, 6, 1, 0, -23],
		[-22, 9, 5, -11, -10, -2, 3, -19],
		[-31, 8, -7, -37, -36, -14, 3, -31],
		[0, 0, 0, 0, 0, 0, 0, 0],
	],
	n: [
		[-66, -53, -75, -75, -10, -55, -58, -70],
		[-3, -6, 100, -36, 4, 62, -4, -14],
		[10, 67, 1, 74, 73, 27, 62, -2],
		[24, 24, 45, 37, 33, 41, 25, 17],
		[-1, 5, 31, 21, 22, 35, 2, 0],
		[-18, 10, 13, 22, 18, 15, 11, -14],
		[-23, -15, 2, 0, 2, 0, -23, -20],
		[-74, -23, -26, -24, -19, -35, -22, -69],
	],
	b: [
		[-59, -78, -82, -76, -23, -107, -37, -50],
		[-11, 20, 35, -42, -39, 31, 2, -22],
		[-9, 39, -32, 41, 52, -10, 28, -14],
		[25, 17, 20, 34, 26, 25, 15, 10],
		[13, 10, 17, 23, 17, 16, 0, 7],
		[14, 25, 24, 15, 8, 25, 20, 15],
		[19, 20, 11, 6, 7, 6, 20, 16],
		[-7, 2, -15, -12, -14, -15, -10, -10],
	],
	r: [
		[35, 29, 33, 4, 37, 33, 56, 50],
		[55, 29, 56, 67, 55, 62, 34, 60],
		[19, 35, 28, 33, 45, 27, 25, 15],
		[0, 5, 16, 13, 18, -4, -9, -6],
		[-28, -35, -16, -21, -13, -29, -46, -30],
		[-42, -28, -42, -25, -25, -35, -26, -46],
		[-53, -38, -31, -26, -29, -43, -44, -53],
		[-30, -24, -18, 5, -2, -18, -31, -32],
	],
	q: [
		[6, 1, -8, -104, 69, 24, 88, 26],
		[14, 32, 60, -10, 20, 76, 57, 24],
		[-2, 43, 32, 60, 72, 63, 43, 2],
		[1, -16, 22, 17, 25, 20, -13, -6],
		[-14, -15, -2, -5, -1, -10, -20, -22],
		[-30, -6, -13, -11, -16, -11, -16, -27],
		[-36, -18, 0, -19, -15, -15, -21, -38],
		[-39, -30, -31, -13, -31, -36, -34, -42],
	],
	k: [
		[4, 54, 47, -99, -99, 60, 83, -62],
		[-32, 10, 55, 56, 56, 55, 10, 3],
		[-62, 12, -57, 44, -67, 28, 37, -31],
		[-55, 50, 11, -4, -19, 13, 0, -49],
		[-55, -43, -52, -28, -51, -47, -8, -50],
		[-47, -42, -43, -79, -64, -32, -29, -32],
		[-4, 3, -14, -50, -57, -18, 13, 4],
		[17, 30, -3, -14, 6, -1, 40, 18],
	],
	k_e: [
		[-50, -40, -30, -20, -20, -30, -40, -50],
		[-30, -20, -10, 0, 0, -10, -20, -30],
		[-30, -10, 20, 30, 30, 20, -10, -30],
		[-30, -10, 30, 40, 40, 30, -10, -30],
		[-30, -10, 30, 40, 40, 30, -10, -30],
		[-30, -10, 20, 30, 30, 20, -10, -30],
		[-30, -30, 0, 0, 0, 0, -30, -30],
		[-50, -30, -30, -30, -30, -30, -30, -50],
	],
};

// 黑方 PST：白方位置表上下翻转
const PST_B: Record<string, number[][]> = {};
for (const key in PST_W) {
	PST_B[key] = PST_W[key].slice().reverse();
}
const PST_OPPONENT: Record<string, Record<string, number[][]>> = { w: PST_B, b: PST_W };
const PST_SELF: Record<string, Record<string, number[][]>> = { w: PST_W, b: PST_B };

export enum AIDifficulty {
	EASY = "easy",
	MEDIUM = "medium",
	HARD = "hard",
	MASTER = "master",
}

interface DifficultyConfig {
	maxDepth: number;
	maxTime: number;
}

const DIFFICULTY_CONFIG: Record<AIDifficulty, DifficultyConfig> = {
	[AIDifficulty.EASY]: { maxDepth: 2, maxTime: 300 },
	[AIDifficulty.MEDIUM]: { maxDepth: 4, maxTime: 800 },
	[AIDifficulty.HARD]: { maxDepth: 6, maxTime: 2000 },
	[AIDifficulty.MASTER]: { maxDepth: 10, maxTime: 5000 },
};

type TTFlag = 0 | 1 | 2;
interface TTEntry {
	depth: number;
	value: number;
	flag: TTFlag;
	bestMove?: string;
}
interface SearchResult {
	move: Move | null;
	score: number;
	depth: number;
	nodes: number;
	elapsed: number;
	nps: number;
	stopped: boolean;
}
interface SearchInfo {
	depth: number;
	nodes: number;
	elapsed: number;
	score: number;
	bestMove: Move | null;
	nps: number;
	stopped: boolean;
}

const MATE_SCORE = 1_000_000;
const MATE_THRESHOLD = 900_000;
const MAX_TT_SIZE = 100_000;
const MAX_QSEARCH_DEPTH = 16;
const MAX_SEARCH_PLY = 128;
const INF = 1_100_000;

export class ChessAI {
	private chess: Chess;
	private difficulty: AIDifficulty;
	private readonly transpositionTable = new Map<string, TTEntry>();
	private readonly killerMoves: string[][] = [];
	private readonly historyTable: Record<string, number> = {};

	private searching = false;
	private stopped = false;
	private startTime = 0;
	private timeLimit = 0;
	private nodes = 0;
	private searchResult: SearchResult | null = null;

	constructor(chess: Chess, difficulty: AIDifficulty = AIDifficulty.MEDIUM) {
		this.chess = chess;
		this.difficulty = difficulty;
	}

	public setDifficulty(difficulty: AIDifficulty): void {
		this.difficulty = difficulty;
	}

	public setChess(chess: Chess): void {
		this.chess = chess;
		this.clearSearchData();
	}

	public clearSearchData(): void {
		this.transpositionTable.clear();
		this.killerMoves.length = 0;
		for (const key in this.historyTable) delete this.historyTable[key];
		this.searchResult = null;
	}

	public stopSearch(): void {
		this.stopped = true;
	}
	public isSearching(): boolean {
		return this.searching;
	}

	public getSearchInfo(): SearchInfo | null {
		if (!this.searchResult) return null;
		return {
			depth: this.searchResult.depth,
			nodes: this.searchResult.nodes,
			elapsed: this.searchResult.elapsed,
			score: this.searchResult.score,
			bestMove: this.searchResult.move,
			nps: this.searchResult.nps,
			stopped: this.searchResult.stopped,
		};
	}

	// ========================================================
	// 基础工具
	// ========================================================
	private getOpponent(color: "w" | "b"): "w" | "b" {
		return color === "w" ? "b" : "w";
	}
	private getSquareFromNotation(square: string): [number, number] {
		return [8 - Number(square[1]), square.charCodeAt(0) - "a".charCodeAt(0)];
	}
	private getMoveKey(move: Move): string {
		return `${move.from}${move.to}${move.promotion || ""}`;
	}
	private isPromotion(move: Move): boolean {
		return move.flags.includes("p");
	}
	private isDrawPosition(): boolean {
		return this.chess.isDraw() || this.chess.isThreefoldRepetition();
	}

	private shouldStop(): boolean {
		if (this.stopped) return true;
		if ((this.nodes & 255) !== 0) return false;
		if (Date.now() - this.startTime >= this.timeLimit) {
			this.stopped = true;
			return true;
		}
		return false;
	}

	// ========================================================
	// 评估函数
	// ========================================================
	private getGamePhase(): number {
		const board = this.chess.board();
		let phase = 0;
		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				const piece = board[row][col];
				if (!piece) continue;
				switch (piece.type) {
					case "q":
						phase += 4;
						break;
					case "r":
						phase += 2;
						break;
					case "b":
					case "n":
						phase += 1;
						break;
				}
			}
		}
		return Math.min(phase, 24);
	}

	private evaluatePosition(): number {
		const board = this.chess.board();
		let score = 0;
		const phase = this.getGamePhase();
		const endgameRatio = 1 - phase / 24;
		let whiteBishops = 0;
		let blackBishops = 0;

		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				const piece = board[row][col];
				if (!piece) continue;

				const type = piece.type as PieceSymbol;
				const color = piece.color as "w" | "b";

				if (type === "b") {
					if (color === "w") whiteBishops++;
					else blackBishops++;
				}

				const material = WEIGHTS[type] || 0;
				let pstValue = 0;

				if (type === "k") {
					const middleGameValue = PST_W.k[row][col];
					const endGameValue = PST_W.k_e[row][col];
					const whiteKingValue = middleGameValue * (1 - endgameRatio) + endGameValue * endgameRatio;
					const blackKingValue = PST_B.k[row][col] * (1 - endgameRatio) + PST_B.k_e[row][col] * endgameRatio;
					pstValue = color === "w" ? whiteKingValue : blackKingValue;
				} else {
					pstValue = color === "w" ? PST_W[type][row][col] : PST_B[type][row][col];
				}

				const value = material + pstValue;
				score += color === "w" ? value : -value;
			}
		}

		if (whiteBishops >= 2) score += 30;
		if (blackBishops >= 2) score -= 30;

		return this.chess.turn() === "w" ? score : -score;
	}

	public evaluateBoard(move: Move, prevSum: number, color: "w" | "b"): number {
		let score = prevSum;
		if (this.chess.isCheckmate()) return move.color === color ? 10_000_000 : -10_000_000;
		if (this.chess.isDraw() || this.chess.isThreefoldRepetition() || this.chess.isStalemate()) return 0;
		if (this.chess.isCheck()) score += move.color === color ? 50 : -50;

		const from = this.getSquareFromNotation(move.from);
		const to = this.getSquareFromNotation(move.to);
		const pieceForEval = move.piece === "k" && score < -1500 ? ("k_e" as PieceSymbol) : (move.piece as PieceSymbol);

		if (move.captured) {
			if (move.color === color)
				score += WEIGHTS[move.captured] + PST_OPPONENT[move.color][move.captured][to[0]][to[1]];
			else score -= WEIGHTS[move.captured] + PST_SELF[move.color][move.captured][to[0]][to[1]];
		}

		if (this.isPromotion(move)) {
			const promotion = "q";
			if (move.color === color) {
				score -= WEIGHTS[pieceForEval] + PST_SELF[move.color][pieceForEval][from[0]][from[1]];
				score += WEIGHTS[promotion] + PST_SELF[move.color][promotion][to[0]][to[1]];
			} else {
				score += WEIGHTS[pieceForEval] + PST_SELF[move.color][pieceForEval][from[0]][from[1]];
				score -= WEIGHTS[promotion] + PST_SELF[move.color][promotion][to[0]][to[1]];
			}
		} else {
			if (move.color !== color) {
				score += PST_SELF[move.color][pieceForEval][from[0]][from[1]];
				score -= PST_SELF[move.color][pieceForEval][to[0]][to[1]];
			} else {
				score -= PST_SELF[move.color][pieceForEval][from[0]][from[1]];
				score += PST_SELF[move.color][pieceForEval][to[0]][to[1]];
			}
		}
		return score;
	}

	// ========================================================
	// 搜索核心
	// ========================================================
	private moveOrderingScore(move: Move, pvMove?: string, ttMove?: string, ply: number = 0): number {
		const moveKey = this.getMoveKey(move);
		if (ttMove && moveKey === ttMove) return 2_000_000;
		if (pvMove && moveKey === pvMove) return 1_900_000;

		let score = 0;
		if (move.captured) {
			const victim = WEIGHTS[move.captured] || 0;
			const attacker = WEIGHTS[move.piece] || 0;
			score += 1_000_000 + victim * 10 - attacker;
		}
		if (this.isPromotion(move)) score += 900_000;
		if (move.san.includes("+") || move.san.includes("#")) score += 800_000;

		const killers = this.killerMoves[ply];
		if (killers) {
			if (killers[0] === moveKey) score += 700_000;
			else if (killers[1] === moveKey) score += 600_000;
		}

		const historyKey = `${move.color}_${move.from}_${move.to}`;
		score += this.historyTable[historyKey] || 0;
		const to = this.getSquareFromNotation(move.to);
		score += 10 - (Math.abs(to[0] - 3.5) + Math.abs(to[1] - 3.5));
		return score;
	}

	private orderMoves(moves: Move[], pvMove?: string, ttMove?: string, ply: number = 0): Move[] {
		return [...moves].sort(
			(a, b) => this.moveOrderingScore(b, pvMove, ttMove, ply) - this.moveOrderingScore(a, pvMove, ttMove, ply),
		);
	}

	private updateKillerMove(move: Move, ply: number): void {
		const key = this.getMoveKey(move);
		if (!this.killerMoves[ply]) this.killerMoves[ply] = [];
		const killers = this.killerMoves[ply];
		if (killers[0] === key) return;
		killers[1] = killers[0];
		killers[0] = key;
	}

	private updateHistory(move: Move, depth: number): void {
		const key = `${move.color}_${move.from}_${move.to}`;
		const bonus = depth * depth;
		this.historyTable[key] = (this.historyTable[key] || 0) + bonus;
		if (this.historyTable[key] > 100_000) this.historyTable[key] = 100_000;
	}

	private scoreToTT(score: number, ply: number): number {
		if (score > MATE_THRESHOLD) return score + ply;
		if (score < -MATE_THRESHOLD) return score - ply;
		return score;
	}

	private scoreFromTT(score: number, ply: number): number {
		if (score > MATE_THRESHOLD) return score - ply;
		if (score < -MATE_THRESHOLD) return score + ply;
		return score;
	}

	private saveTT(key: string, depth: number, value: number, flag: TTFlag, ply: number, bestMove?: string): void {
		const oldEntry = this.transpositionTable.get(key);
		if (oldEntry && oldEntry.depth > depth) return;
		if (this.transpositionTable.size >= MAX_TT_SIZE) this.transpositionTable.clear();
		this.transpositionTable.set(key, { depth, value: this.scoreToTT(value, ply), flag, bestMove });
	}

	private quiescence(alpha: number, beta: number, ply: number, qDepth: number): number {
		this.nodes++;
		if (this.shouldStop()) return this.evaluatePosition();
		if (this.isDrawPosition()) return 0;
		if (ply >= MAX_SEARCH_PLY) return this.evaluatePosition();

		const inCheck = this.chess.isCheck();
		const legalMoves = this.chess.moves({ verbose: true });
		if (legalMoves.length === 0) {
			if (inCheck) return -MATE_SCORE + ply;
			return 0;
		}

		if (!inCheck) {
			const standPat = this.evaluatePosition();
			if (standPat >= beta) return beta;
			if (standPat > alpha) alpha = standPat;
			if (qDepth >= MAX_QSEARCH_DEPTH) return alpha;
		}

		const tacticalMoves = inCheck ? legalMoves : legalMoves.filter(move => move.captured || this.isPromotion(move));
		if (tacticalMoves.length === 0) return alpha;
		const orderedMoves = this.orderMoves(tacticalMoves, undefined, undefined, ply);

		for (const move of orderedMoves) {
			if (this.shouldStop()) break;
			this.chess.move(move);
			let score: number;
			try {
				score = -this.quiescence(-beta, -alpha, ply + 1, qDepth + 1);
			} finally {
				this.chess.undo();
			}
			if (score >= beta) return beta;
			if (score > alpha) alpha = score;
		}
		return alpha;
	}

	private negamax(depth: number, alpha: number, beta: number, ply: number, pvMove?: string): number {
		this.nodes++;
		if (this.shouldStop()) return this.evaluatePosition();
		if (this.isDrawPosition()) return 0;
		if (ply >= MAX_SEARCH_PLY) return this.evaluatePosition();
		if (depth <= 0) return this.quiescence(alpha, beta, ply, 0);

		const alphaOrig = alpha;
		const betaOrig = beta;
		const key = this.getTTKey();
		const cached = this.transpositionTable.get(key);
		let ttMove: string | undefined;

		if (cached) {
			ttMove = cached.bestMove;
			if (cached.depth >= depth) {
				const ttScore = this.scoreFromTT(cached.value, ply);
				if (cached.flag === 0) return ttScore;
				if (cached.flag === 1) alpha = Math.max(alpha, ttScore);
				else if (cached.flag === 2) beta = Math.min(beta, ttScore);
				if (alpha >= beta) return ttScore;
			}
		}

		const legalMoves = this.chess.moves({ verbose: true });
		if (legalMoves.length === 0) {
			if (this.chess.isCheckmate()) return -MATE_SCORE + ply;
			return 0;
		}

		const orderedMoves = this.orderMoves(legalMoves, pvMove, ttMove, ply);
		let bestScore = -INF;
		let bestMove: Move | null = null;
		let moveIndex = 0;

		for (const move of orderedMoves) {
			if (this.shouldStop()) break;
			this.chess.move(move);

			let score: number;
			try {
				const canReduce =
					moveIndex >= 3 && depth >= 3 && !this.chess.isCheck() && !move.captured && !this.isPromotion(move);
				if (moveIndex === 0) {
					score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
				} else {
					let searchDepth = depth - 1;
					if (canReduce) searchDepth--;
					score = -this.negamax(searchDepth, -alpha - 1, -alpha, ply + 1);
					if (canReduce && score > alpha) score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1);
					if (score > alpha && score < beta) score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
				}
			} finally {
				this.chess.undo();
			}

			if (score > bestScore) {
				bestScore = score;
				bestMove = move;
			}
			if (score > alpha) alpha = score;

			if (alpha >= beta) {
				if (!move.captured) {
					this.updateKillerMove(move, ply);
					this.updateHistory(move, depth);
				}
				break;
			}
			moveIndex++;
		}

		if (this.stopped) return bestScore === -INF ? this.evaluatePosition() : bestScore;
		if (bestScore === -INF) return this.evaluatePosition();

		let flag: TTFlag = 0;
		if (bestScore <= alphaOrig) flag = 2;
		else if (bestScore >= betaOrig) flag = 1;
		this.saveTT(key, depth, bestScore, flag, ply, bestMove ? this.getMoveKey(bestMove) : undefined);
		return bestScore;
	}

	private getTTKey(): string {
		return this.chess.fen();
	}

	private iterativeDeepening(color: "w" | "b"): SearchResult {
		const config = DIFFICULTY_CONFIG[this.difficulty];
		this.startTime = Date.now();
		this.timeLimit = config.maxTime;
		this.nodes = 0;
		this.stopped = false;
		this.searching = true;
		this.killerMoves.length = 0;

		let bestMove: Move | null = null;
		let bestScore = 0;
		let completedDepth = 0;

		const allMoves = this.chess.moves({ verbose: true });
		if (allMoves.length === 0) {
			this.searching = false;
			return { move: null, score: 0, depth: 0, nodes: 0, elapsed: 0, nps: 0, stopped: false };
		}

		bestMove = this.orderMoves(allMoves)[0];
		let pvMove: string | undefined;

		for (let depth = 1; depth <= config.maxDepth; depth++) {
			if (this.shouldStop()) break;

			const alpha = -INF;
			const beta = INF;
			const rootMoves = this.orderMoves(this.chess.moves({ verbose: true }), pvMove);

			let iterationBestMove: Move | null = null;
			let iterationBestScore = -INF;
			let iterationAlpha = alpha;

			for (const move of rootMoves) {
				if (this.shouldStop()) break;
				this.chess.move(move);
				let score: number;
				try {
					score = -this.negamax(depth - 1, -beta, -iterationAlpha, 1);
				} finally {
					this.chess.undo();
				}

				if (this.stopped) break;
				if (score > iterationBestScore) {
					iterationBestScore = score;
					iterationBestMove = move;
				}
				if (score > iterationAlpha) iterationAlpha = score;
			}

			if (this.stopped || !iterationBestMove || iterationBestScore === -INF) break;
			bestMove = iterationBestMove;
			bestScore = iterationBestScore;
			completedDepth = depth;
			pvMove = this.getMoveKey(iterationBestMove);

			if (Math.abs(bestScore) >= MATE_THRESHOLD && MATE_SCORE - Math.abs(bestScore) <= depth) break;
		}

		const elapsed = Date.now() - this.startTime;
		this.searching = false;
		return {
			move: bestMove,
			score: bestScore,
			depth: completedDepth,
			nodes: this.nodes,
			elapsed,
			nps: elapsed > 0 ? Math.floor((this.nodes * 1000) / elapsed) : 0,
			stopped: this.stopped,
		};
	}

	public getBestMoveResult(color: "w" | "b"): SearchResult {
		if (this.searching) throw new Error("ChessAI is already searching.");
		if (this.chess.turn() !== color) throw new Error(`Turn mismatch: ${this.chess.turn()} vs ${color}`);
		const result = this.iterativeDeepening(color);
		this.searchResult = result;
		return result;
	}

	public getBestMoveAsync(color: "w" | "b", _currSum: number): Promise<Move | null> {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				try {
					const result = this.getBestMoveResult(color);
					resolve(result.move);
				} catch (error) {
					reject(error);
				}
			}, 0);
		});
	}
}
