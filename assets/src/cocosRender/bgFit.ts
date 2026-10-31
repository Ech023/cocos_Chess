enum selectModelType {
	"以改变宽高的形式" = 1,
	"以改变scale的形式" = 2,
}
enum selectSizeType {
	"以图片大小为初始尺寸" = 1,
	"以设定大小为初始尺寸" = 2,
}
enum selectShowType {
	"铺满屏幕优先" = 1,
	"内容完全优先" = 2,
}
import { _decorator, Component, Node, UITransform, log, Enum, CCFloat, warn, Sprite, Widget, Layout, error } from "cc";
import { EDITOR, PREVIEW } from "cc/env";
const { ccclass, executeInEditMode, disallowMultiple, property } = _decorator;
@ccclass
@executeInEditMode()
@disallowMultiple()
export default class bgFit extends Component {
	@property({ type: Enum(selectModelType), displayName: "适配模式" })
	_modelType: selectModelType = selectModelType["以改变scale的形式"];

	@property({ type: Enum(selectSizeType), displayName: "初始尺寸" })
	_sizeType: selectSizeType = selectSizeType["以设定大小为初始尺寸"];

	@property({ type: Enum(selectShowType), displayName: "显示模式" })
	_showType: selectShowType = selectShowType["内容完全优先"];

	@property({ displayName: "初始宽度" })
	_orWidth: number = 0;

	@property({ displayName: "初始高度" })
	_orHeight: number = 0;

	@property({ displayName: "初始scaleX" })
	_orScaleX: number = 0;

	@property({ displayName: "初始scaleY" })
	_orScaleY: number = 0;

	@property({ type: Enum(selectModelType), displayName: "适配模式" })
	set modelType(type: selectModelType) {
		this._modelType = type;
		this.autoSize();
	}
	get modelType() {
		return this._modelType;
	}

	@property({ type: Enum(selectSizeType), displayName: "初始尺寸" })
	set sizeType(type: selectSizeType) {
		this._sizeType = type;
		this.autoSize();
	}
	get sizeType() {
		return this._sizeType;
	}

	@property({ type: Enum(selectShowType), displayName: "显示模式" })
	set showType(type: selectShowType) {
		this._showType = type;
		this.autoSize();
	}
	get showType() {
		return this._showType;
	}
	@property({
		type: CCFloat,
		displayName: "初始宽度",
		visible() {
			return this.sizeType == selectSizeType["以设定大小为初始尺寸"];
		},
	})
	set orWidth(number: number) {
		if (!number || number <= 0) {
			if (EDITOR || PREVIEW) warn("初始宽度必须大于0");
			return;
		}
		this._orWidth = number;
		this.autoSize();
	}
	get orWidth() {
		return this._orWidth;
	}

	@property({
		type: CCFloat,
		displayName: "初始高度",
		visible() {
			return this.sizeType == selectSizeType["以设定大小为初始尺寸"];
		},
	})
	set orHeight(number: number) {
		if (!number || number <= 0) {
			if (EDITOR || PREVIEW) warn("初始高度必须大于0");
			return;
		}
		this._orHeight = number;
		this.autoSize();
	}
	get orHeight() {
		return this._orHeight;
	}

	@property({ type: CCFloat, displayName: "初始scaleX" })
	set orScaleX(number: number) {
		if (!number || number <= 0) {
			if (EDITOR || PREVIEW) warn("初始scaleX必须大于0");
			return;
		}
		this._orScaleX = number;
		this.autoSize();
	}
	get orScaleX() {
		return this._orScaleX;
	}

	@property({ type: CCFloat, displayName: "初始scaleY" })
	set orScaleY(number: number) {
		if (!number || number <= 0) {
			if (EDITOR || PREVIEW) warn("初始scaleY必须大于0");
			return;
		}
		this._orScaleY = number;
		this.autoSize();
	}
	get orScaleY() {
		return this._orScaleY;
	}
	onLoad() {}
	protected start(): void {
		if (this.node.parent) {
			this.node.parent.on(Node.EventType.SIZE_CHANGED, this.autoSize, this);
		}
		this.autoSize();
	}
	protected onDisable(): void {
		if (this.node.parent) {
			this.node.parent.off(Node.EventType.SIZE_CHANGED, this.autoSize, this);
		}
	}
	autoSize() {
		try {
			if (!this.node.parent) {
				if (EDITOR || PREVIEW) warn("[bgFit] 节点缺少父节点");
				return;
			}
			if (EDITOR && this.node.parent.name == "New Node" && !this.node.parent.parent) {
				return;
			}

			const sprite = this.node.getComponent(Sprite);
			const spriteFrame = sprite?.spriteFrame;
			if (this.sizeType == selectSizeType.以图片大小为初始尺寸 && !spriteFrame) {
				throw new Error("当前使用图片大小模式，但缺少图片资源");
			}

			const widget = this.getComponent(Widget);
			if (
				widget?.enabled &&
				((widget.isAlignLeft && widget.isAlignRight) || (widget.isAlignTop && widget.isAlignBottom)) &&
				this.modelType == selectModelType.以改变宽高的形式
			) {
				throw new Error("当前模式与 Widget 组件设置冲突，请检查对齐方式");
			}

			const layout = this.getComponent(Layout);
			if (
				layout?.enabled &&
				layout.resizeMode == Layout.ResizeMode.CONTAINER &&
				this.modelType == selectModelType.以改变宽高的形式
			) {
				throw new Error("当前模式与 Layout 组件设置冲突，请检查 resizeMode");
			}

			if (!this._orWidth || this._orWidth <= 0) throw new Error("初始宽度必须大于0");
			if (!this._orHeight || this._orHeight <= 0) throw new Error("初始高度必须大于0");
			if (!this._orScaleX || this._orScaleX <= 0) throw new Error("初始scaleX必须大于0");
			if (!this._orScaleY || this._orScaleY <= 0) throw new Error("初始scaleY必须大于0");

			const uiTransform = this.getComponent(UITransform);
			const parentTransform = this.node.parent.getComponent(UITransform);
			if (!uiTransform || !parentTransform) {
				throw new Error("缺少 UITransform 组件");
			}

			// 还原节点初始状态
			this.node.setScale(this._orScaleX, this._orScaleY, this.node.scale.z);
			uiTransform.width = this._orWidth;
			uiTransform.height = this._orHeight;

			// 获取目标尺寸
			let targetWidth = this._orWidth;
			let targetHeight = this._orHeight;
			if (this.sizeType == selectSizeType.以图片大小为初始尺寸 && spriteFrame) {
				const rect = spriteFrame.rect;
				targetWidth = rect.width;
				targetHeight = rect.height;
			}

			// 计算缩放比例
			const parentSize = parentTransform.contentSize;
			const scaleX = parentSize.width / (targetWidth * this._orScaleX);
			const scaleY = parentSize.height / (targetHeight * this._orScaleY);

			// 根据显示模式选择缩放比例
			const finalScale =
				this.showType == selectShowType.铺满屏幕优先 ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

			// 应用缩放
			if (this.modelType == selectModelType.以改变宽高的形式) {
				uiTransform.width = targetWidth * finalScale;
				uiTransform.height = targetHeight * finalScale;
			} else {
				this.node.setScale(this._orScaleX * finalScale, this._orScaleY * finalScale, this.node.scale.z);
			}

			// 打印节点路径
			let path = this.node.name;
			let tempNode = this.node;
			while (tempNode.parent) {
				tempNode = tempNode.parent;
				path = tempNode.name + "/" + path;
			}
			if (EDITOR || PREVIEW) {
				log(`[${path}]适配完成 - 模式:${this.modelType}, 最终比例:${finalScale}`);
			}
		} catch (e) {
			if (EDITOR || PREVIEW) error("[bgFit]", e);
		}
	}
	// update(dt) {}
}
