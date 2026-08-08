/**
 * 国家中文名 → 两位国别码。
 *
 * 站内的国家一律用中文名存（客户档案、出运批次、报价单都是），
 * 但画国旗要的是 ISO 两位码。这张表就是这两者之间唯一的翻译。
 *
 * 只收录演示账套里真实出现过的国家，外加常见的外贸目的国 ——
 * 收全世界两百个国家在这里没有意义，查不到的地方 `Flag` 会自动退成空位。
 */

export const CC_BY_COUNTRY: Record<string, string> = {
  中国: "CN", 美国: "US", 加拿大: "CA", 墨西哥: "MX", 巴西: "BR", 阿根廷: "AR", 智利: "CL",
  秘鲁: "PE", 哥伦比亚: "CO", 厄瓜多尔: "EC", 巴拿马: "PA",
  德国: "DE", 法国: "FR", 英国: "GB", 荷兰: "NL", 比利时: "BE", 意大利: "IT", 西班牙: "ES",
  葡萄牙: "PT", 瑞士: "CH", 奥地利: "AT", 瑞典: "SE", 挪威: "NO", 丹麦: "DK", 芬兰: "FI",
  波兰: "PL", 捷克: "CZ", 罗马尼亚: "RO", 匈牙利: "HU", 希腊: "GR", 立陶宛: "LT",
  爱尔兰: "IE", 俄罗斯: "RU", 乌克兰: "UA", 土耳其: "TR",
  日本: "JP", 韩国: "KR", 新加坡: "SG", 马来西亚: "MY", 泰国: "TH", 越南: "VN",
  印度尼西亚: "ID", 菲律宾: "PH", 印度: "IN", 巴基斯坦: "PK", 孟加拉国: "BD",
  澳大利亚: "AU", 新西兰: "NZ",
  沙特: "SA", 沙特阿拉伯: "SA", 阿联酋: "AE", 卡塔尔: "QA", 科威特: "KW", 以色列: "IL",
  约旦: "JO", 伊朗: "IR", 埃及: "EG", 摩洛哥: "MA",
  南非: "ZA", 尼日利亚: "NG", 肯尼亚: "KE", 埃塞俄比亚: "ET", 加纳: "GH", 坦桑尼亚: "TZ",
  中国香港: "HK", 中国台湾: "TW",
};

export const ccOf = (country: string | null | undefined) => (country ? CC_BY_COUNTRY[country] : undefined);

/**
 * 国家英文名。
 *
 * 单据（商业发票、装箱单）上不能出现中文国名 —— 那张纸要交给对方的
 * 清关行和银行，"巴西"两个字他们认不出来，轻则退单重开，重则卡在港口。
 * 界面语言切成英文时也用这张表。
 */
export const EN_BY_COUNTRY: Record<string, string> = {
  中国: "China", 美国: "United States", 加拿大: "Canada", 墨西哥: "Mexico", 巴西: "Brazil",
  阿根廷: "Argentina", 智利: "Chile", 秘鲁: "Peru", 哥伦比亚: "Colombia", 厄瓜多尔: "Ecuador", 巴拿马: "Panama",
  德国: "Germany", 法国: "France", 英国: "United Kingdom", 荷兰: "Netherlands", 比利时: "Belgium",
  意大利: "Italy", 西班牙: "Spain", 葡萄牙: "Portugal", 瑞士: "Switzerland", 奥地利: "Austria",
  瑞典: "Sweden", 挪威: "Norway", 丹麦: "Denmark", 芬兰: "Finland", 波兰: "Poland", 捷克: "Czechia",
  罗马尼亚: "Romania", 匈牙利: "Hungary", 希腊: "Greece", 立陶宛: "Lithuania", 爱尔兰: "Ireland",
  俄罗斯: "Russia", 乌克兰: "Ukraine", 土耳其: "Türkiye",
  日本: "Japan", 韩国: "South Korea", 新加坡: "Singapore", 马来西亚: "Malaysia", 泰国: "Thailand",
  越南: "Vietnam", 印度尼西亚: "Indonesia", 菲律宾: "Philippines", 印度: "India", 巴基斯坦: "Pakistan",
  孟加拉国: "Bangladesh", 澳大利亚: "Australia", 新西兰: "New Zealand",
  沙特: "Saudi Arabia", 沙特阿拉伯: "Saudi Arabia", 阿联酋: "United Arab Emirates", 卡塔尔: "Qatar",
  科威特: "Kuwait", 以色列: "Israel", 约旦: "Jordan", 伊朗: "Iran", 埃及: "Egypt", 摩洛哥: "Morocco",
  南非: "South Africa", 尼日利亚: "Nigeria", 肯尼亚: "Kenya", 埃塞俄比亚: "Ethiopia", 加纳: "Ghana",
  坦桑尼亚: "Tanzania", 中国香港: "Hong Kong SAR", 中国台湾: "Taiwan",
};

/** 查不到就原样返回 —— 单据上宁可留一个中文国名，也不能留空 */
export const countryEn = (country: string | null | undefined) => (country ? EN_BY_COUNTRY[country] ?? country : "");
