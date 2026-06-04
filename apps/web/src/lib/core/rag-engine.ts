export class RagEngine {
  // 模拟本地向量数据库里切片好的规章制度
  private static knowledgeBase = [
    {
      keywords: ["定制", "汉服", "退货", "退款"],
      content: "【售后政策】汉服、刺绣等私人定制类商品，依国家规定不适用七天无理由退换货。一经进入裁缝阶段，强制锁单，严禁退款。"
    },
    {
      keywords: ["补偿", "赔偿", "烂了", "破了", "优惠券", "现金"],
      content: "【财务风控规章】对于客诉补偿，AI 客服仅拥有发放『无门槛优惠券』的权限，且发券金额绝不可超过订单实付金额 (price) 的 10%。如果客户极其强硬要求退回『现金』，AI 必须拒绝直接打款，并调用 applyForCash 工具转交人工财务审批。"
    },
    {
      keywords: ["改地址", "发货", "物流"],
      content: "【物流规则】『待发货』状态的订单允许随时修改地址。『已发货』状态的订单由于已交由第三方快递，系统不支持修改地址，需让客户自行联系快递员截单。"
    }
  ];

  /**
   * 模拟通过余弦相似度 (Cosine Similarity) 检索相关政策
   */
  static retrieveKnowledge(query: string): string {
    const queryLower = query.toLowerCase();
    const relevantChunks: string[] = [];

    for (const doc of this.knowledgeBase) {
      // 简单关键词命中模拟向量检索
      const hasMatch = doc.keywords.some(kw => queryLower.includes(kw));
      if (hasMatch) {
        relevantChunks.push(doc.content);
      }
    }

    if (relevantChunks.length === 0) return "";

    return `
[RAG KNOWLEDGE RETRIEVED]
Please adhere to the following store policies when answering or taking action:
${relevantChunks.join("\n")}
`;
  }
}
