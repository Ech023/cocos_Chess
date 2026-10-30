import { _decorator, Component, Graphics, Label, Color, UITransform, Size, Node, Layers, tween, Vec3, UIOpacity } from "cc";
import type { PieceSnapshot } from "../cheesCore/engine";

const { ccclass } = _decorator;

/**
 * 单枚棋子的视图组件
 * 负责：
 * 1. 自动生成渲染所需的基础节点（底圆 Graphics 和 文字 Label）
 * 2. 根据传入的快照数据渲染颜色、大小、选中/落子状态
 * 3. 提供被吃掉时的“放大、旋转、缩小消散”动画
 */
@ccclass("ChessPiece")
export class ChessPiece extends Component {
	private bg: Graphics = null!;
	private nameLabel: Label = null!;

	onLoad() {
		// 1. 确保当前节点有 UITransform 组件（用于处理点击、坐标计算）
		if (!this.node.getComponent(UITransform)) {
			this.node.addComponent(UITransform);
		}
		// 强制设置渲染层级为 UI_2D，防止被摄像机忽略
		this.node.layer = Layers.Enum.UI_2D;

		// 2. 自动创建并挂载背景 Graphics 节点
		let bgNode = this.node.getChildByName("Bg");
		if (!bgNode) {
			bgNode = new Node("Bg");
			bgNode.parent = this.node;
			bgNode.layer = Layers.Enum.UI_2D;
		}
		this.bg = bgNode.getComponent(Graphics) || bgNode.addComponent(Graphics);

		// 3. 自动创建并挂载文字 Label 节点
		let labelNode = this.node.getChildByName("Name");
		if (!labelNode) {
			labelNode = new Node("Name");
			labelNode.parent = this.node;
			labelNode.layer = Layers.Enum.UI_2D;
		}
		this.nameLabel = labelNode.getComponent(Label) || labelNode.addComponent(Label);

		// 文字居中，并开启字符缓存优化性能
		this.nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
		this.nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
		this.nameLabel.cacheMode = Label.CacheMode.CHAR;
	}

	/**
	 * 根据快照数据渲染棋子外观
	 * @param p 棋子状态快照（包含阵营、名称、是否选中、是否上一步落子等）
	 * @param radius 基础半径
	 */
	render(p: PieceSnapshot, radius: number) {
		if (!this.bg || !this.nameLabel) return;

		const isRed = p.side === "RED";

		// --- 颜色配置 ---
		// 默认颜色：红方底色泛黄，黑方底色偏青，文字红/黑
		let bgColor = isRed ? new Color(254, 236, 160, 255) : new Color(253, 236, 158, 255);
		let textColor = isRed ? new Color(193, 25, 12, 255) : new Color(0, 0, 0, 255);
		let borderColor = p.isChoose ? new Color(255, 0, 0, 255) : textColor; // 选中时边框变红

		// --- 尺寸配置 ---
		// ⭐ 只有选中时放大 1.1 倍左右，其他情况保持原尺寸（落子不放大）
		const r = p.isChoose ? radius / 0.9 : radius;

		// --- 落子状态高亮 ---
		if (p.isLastMove && !p.isChoose) {
			// 背景更加明亮泛白
			bgColor = isRed ? new Color(255, 250, 210, 255) : new Color(245, 245, 220, 255);
			// 边框变成醒目的亮蓝色
			borderColor = new Color(0, 180, 255, 255);
		}

		// --- 开始绘制 ---
		const g = this.bg;
		g.clear();

		// 1. 绘制底色圆
		g.fillColor = bgColor;
		g.circle(0, 0, r);
		g.fill();

		// 2. 绘制双圈边框
		g.lineWidth = p.isLastMove && !p.isChoose ? 4 : 2; // 上一步落子的边框更粗
		g.strokeColor = borderColor;
		g.circle(0, 0, r);
		g.stroke();
		g.circle(0, 0, r - 3);
		g.stroke();

		// 3. 设置文字内容与样式
		this.nameLabel.string = p.displayName;
		this.nameLabel.color = textColor;
		this.nameLabel.fontSize = radius;
		this.nameLabel.lineHeight = radius;
		this.nameLabel.node.setPosition(0, 0); // 确保文字始终居中

		// 4. 更新节点尺寸，确保点击区域与棋子大小匹配
		const ui = this.node.getComponent(UITransform)!;
		ui.setContentSize(new Size(r * 2, r * 2));
	}

	/**
	 * 播放被吃动画
	 * 效果：瞬间放大 -> 快速旋转缩小并变透明 -> 触发销毁回调
	 */
	public playEatAnimation(onComplete: () => void) {
		let opacity = this.node.getComponent(UIOpacity);
		if (!opacity) {
			opacity = this.node.addComponent(UIOpacity);
		}

		// 1. 瞬间放大 1.3 倍，给玩家强烈的视觉反馈
		tween(this.node)
			.to(0.08, { scale: new Vec3(1.3, 1.3, 1) })
			.start();
		tween(opacity).to(0.08, { opacity: 150 }).start(); // 稍微变透明

		// 2. 延迟后快速旋转缩小至消失
		tween(this.node)
			.delay(0.08)
			.to(0.15, { scale: new Vec3(0.1, 0.1, 1), angle: 180 }) // 缩小并旋转 180 度
			.call(() => {
				onComplete(); // 动画结束，通知外部销毁节点
			})
			.start();

		tween(opacity).delay(0.08).to(0.15, { opacity: 0 }).start();
	}
}
