/** 放行状态 → 语义色。绿=正常推进，琥珀=待办，蓝=流程中的中间态。 */
export const RELEASE_TONE: Record<string, string> = {
  已放行: "jade",
  未放行: "amber",
  待报关: "accent",
};

/** 批量更新里的常用短语，一键填入省得每次手打 */
export const PHRASES = ["待客户付尾款", "待电放", "待收 BL COPY", "待报关", "已放单"];
