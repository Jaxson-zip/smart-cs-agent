export type IntentCategory = 'LOGISTICS' | 'COMPENSATION_COUPON' | 'COMPENSATION_CASH' | 'FAQ';

export class RouterAgent {
  /**
   * 模拟一个 Classifier Agent，负责将自然语言分类并提取实体 (Order ID / Amount)
   */
  static parseIntent(userInput: string, contextString: string): { 
    intent: IntentCategory, 
    extractedOrderId: string | null,
    extractedAmount: number | null 
  } {
    const textLower = userInput.toLowerCase();
    let intent: IntentCategory = 'FAQ';
    let extractedOrderId = null;
    let extractedAmount = null;

    // VERY naive extraction for Demo purposes
    const orderMatch = userInput.match(/[A-C]\d{3}/i);
    if (orderMatch) extractedOrderId = orderMatch[0].toUpperCase();

    // Context Injection Disambiguation Simulation
    if (!extractedOrderId && contextString.includes('B202') && textLower.includes('鞋')) {
       extractedOrderId = 'B202';
    } else if (!extractedOrderId && contextString.includes('C303') && textLower.includes('定制')) {
       extractedOrderId = 'C303';
    } else if (!extractedOrderId && contextString.includes('A101') && textLower.includes('手机')) {
       extractedOrderId = 'A101';
    }

    const amountMatch = userInput.match(/(\d+)(块|元)/);
    if (amountMatch) extractedAmount = parseInt(amountMatch[1], 10);

    // Intent Routing Logic
    if (textLower.includes('改') || textLower.includes('地址')) {
      intent = 'LOGISTICS';
    } else if (textLower.includes('退钱') || textLower.includes('现金') || textLower.includes('微信退')) {
      intent = 'COMPENSATION_CASH';
    } else if (textLower.includes('补偿') || textLower.includes('赔偿') || textLower.includes('券') || textLower.includes('烂了')) {
      intent = 'COMPENSATION_COUPON';
    }

    return { intent, extractedOrderId, extractedAmount };
  }
}
