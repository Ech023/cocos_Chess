import { Graphics, Color } from "cc";

export interface BoardLayout {
	left: number; // 棋盘左上角 X 坐标 (相对于中心点)
	top: number; // 棋盘左上角 Y 坐标 (相对于中心点)
	cellSize: number; // 单个格子的宽高
}

/**
 * 绘制静态棋盘
 * 使用 Cocos 的 Graphics 组件，一次性画出所有横线、竖线、九宫格斜线以及兵/炮位的角标
 * @param g Graphics 组件
 * @param layout 棋盘布局尺寸数据
 */
export function drawBoardLines(g: Graphics, layout: BoardLayout) {
	const { left, top, cellSize: cs } = layout;
	const right = left + 8 * cs;
	const bottom = top - 9 * cs;
	g.clear();
	g.lineWidth = 2;
	g.strokeColor = new Color(40, 30, 20, 255); // 古风深褐色线条
	// 1. 画 10 条横线
	for (let i = 0; i <= 9; i++) {
		const y = top - i * cs;
		g.moveTo(left, y);
		g.lineTo(right, y);
	}

	// 2. 画 9 条竖线
	for (let i = 0; i <= 8; i++) {
		const x = left + i * cs;
		if (i === 0 || i === 8) {
			// 最左、最右的边线贯穿整个棋盘
			g.moveTo(x, top);
			g.lineTo(x, bottom);
		} else {
			// 内部竖线在楚河汉界（第4行和第5行之间）断开
			g.moveTo(x, top);
			g.lineTo(x, top - 4 * cs);
			g.moveTo(x, top - 5 * cs);
			g.lineTo(x, bottom);
		}
	}

	// 3. 画九宫格斜线 (X形)
	// 上方九宫格 (y: 0~2)
	g.moveTo(left + 3 * cs, top);
	g.lineTo(left + 5 * cs, top - 2 * cs);
	g.moveTo(left + 5 * cs, top);
	g.lineTo(left + 3 * cs, top - 2 * cs);
	// 下方九宫格 (y: 7~9)
	const bTop = top - 7 * cs;
	g.moveTo(left + 3 * cs, bTop);
	g.lineTo(left + 5 * cs, bTop - 2 * cs);
	g.moveTo(left + 5 * cs, bTop);
	g.lineTo(left + 3 * cs, bTop - 2 * cs);

	// 4. 画炮位和兵卒位的 "L" 形标记
	const markLen = cs * 0.16; // 稍微加长线段，显得更大气
	const padding = cs * 0.08; // 距离交叉点的空隙

	// 内部辅助函数：画一个独立对称的 L
	const drawL = (col: number, row: number) => {
		const cx = left + col * cs;
		const cy = top - row * cs;

		// 判断是否在左右边界
		const hasLeft = col > 0;
		const hasRight = col < 8;

		// dx: 水平方向 (-1向左, 1向右)
		// dy: 垂直方向 (-1向下, 1向上)
		const drawCorner = (x: number, y: number, dx: number, dy: number) => {
			// 画水平线
			g.moveTo(x, y);
			g.lineTo(x + dx * markLen, y);
			// 画垂直线
			g.moveTo(x, y);
			g.lineTo(x, y + dy * markLen);
		};

		// ⭐ 修正方向：向外辐射（这才是标准象棋的L标记）
		// 左上角 (向左、向上)
		if (hasLeft) drawCorner(cx - padding, cy + padding, -1, 1);

		// 右上角 (向右、向上)
		if (hasRight) drawCorner(cx + padding, cy + padding, 1, 1);

		// 左下角 (向左、向下)
		if (hasLeft) drawCorner(cx - padding, cy - padding, -1, -1);

		// 右下角 (向右、向下)
		if (hasRight) drawCorner(cx + padding, cy - padding, 1, -1);
	};

	// 炮位坐标 (1,2), (7,2), (1,7), (7,7)
	const cannons = [
		[1, 2],
		[7, 2],
		[1, 7],
		[7, 7],
	];
	// 兵卒坐标 (0,3)(2,3)... 和 (0,6)...(8,6)
	const soldiers = [
		[0, 3],
		[2, 3],
		[4, 3],
		[6, 3],
		[8, 3],
		[0, 6],
		[2, 6],
		[4, 6],
		[6, 6],
		[8, 6],
	];

	// 绘制所有标记
	[...cannons, ...soldiers].forEach(([col, row]) => drawL(col, row));

	g.stroke();
}
