import { mockDb } from '../app/db';
import { ContextInjector } from './core/context-injector';
import { RagEngine } from './core/rag-engine';
import { RouterAgent } from './agents/router-agent';
import { ToolRegistry } from './tools';

export type ToolCallInfo = {
  id: string;
  name: string;
  args: unknown;
  status: 'pending' | 'success' | 'error';
  result?: unknown;
};

export type OrchestratorMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thoughts?: string[];
  toolCalls?: ToolCallInfo[];
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class AgentOrchestrator {
  private db: typeof mockDb;
  private onDbUpdate: (db: typeof mockDb) => void;

  constructor(initialDb: typeof mockDb, onDbUpdate: (db: typeof mockDb) => void) {
    this.db = initialDb;
    this.onDbUpdate = onDbUpdate;
  }

  async processMessage(
    userText: string, 
    updateMessage: (msg: Partial<OrchestratorMessage>) => void,
    onComplete: (finalMsg: OrchestratorMessage) => void
  ) {
    const msg: OrchestratorMessage = { id: Math.random().toString(), role: 'assistant', content: '', thoughts: [], toolCalls: [] };
    
    const addThought = async (text: string, delay = 600) => {
      msg.thoughts = [...(msg.thoughts || []), text];
      updateMessage({ ...msg });
      await sleep(delay);
    };

    updateMessage(msg);

    // 1. Context Injection
    await addThought("Injecting User Session Context (Last 3 Orders)...");
    const injectedContext = ContextInjector.injectUserContext();

    // 2. RAG Retrieval
    await addThought("Querying Vector DB for Store Policies (RAG)...");
    const retrievedDocs = RagEngine.retrieveKnowledge(userText);
    if (retrievedDocs) await addThought("RAG Match Found. Policies injected to prompt.");

    // 3. Agentic Routing
    await addThought("Routing input via Semantic Classifier Agent...");
    const { intent, extractedOrderId, extractedAmount } = RouterAgent.parseIntent(userText, injectedContext);
    await addThought(`Intent Routed: [${intent}] | Extracted Order: [${extractedOrderId || 'None'}]`);

    if (!extractedOrderId && intent !== 'FAQ') {
      msg.content = "亲，能告诉我您说的是哪个订单吗？（或者直接报一下鞋子/汉服/手机的名字哦）";
      updateMessage({ ...msg });
      return onComplete(msg);
    }

    // 4. Execution & Tool Calling Guardrails
    if (intent === 'LOGISTICS') {
      await addThought("Delegating to Logistics Agent. Executing Tool: modifyAddress()");
      
      const parts = userText.split(/(到|为|改成)/);
      const newAddress = parts[parts.length - 1].trim() || "未知新地址";

      const toolCallId = "call_" + Math.random().toString().substring(7);
      msg.toolCalls = [{ id: toolCallId, name: 'modifyAddress', args: { orderId: extractedOrderId, newAddress }, status: 'pending' }];
      updateMessage({ ...msg });
      await sleep(1500);

      const res = ToolRegistry.modifyAddress(extractedOrderId!, newAddress, this.db);
      msg.toolCalls[0] = { ...msg.toolCalls[0], status: res.success ? 'success' : 'error', result: res };
      updateMessage({ ...msg });
      
      if (res.success) {
        this.onDbUpdate({ ...this.db });
        msg.content = `搞定啦！订单 ${extractedOrderId} 的地址已成功修改为：“${newAddress}”。`;
      } else {
        await addThought("Guardrail Blocked Execution. Reading RAG policy for graceful rejection.");
        msg.content = `非常抱歉！由于系统显示您的订单 ${extractedOrderId} 已经处于“已发货”状态，系统强风控拦截了改地址请求，麻烦您自行联系快递小哥哦。`;
      }

    } else if (intent === 'COMPENSATION_COUPON') {
      await addThought("Delegating to Refund Agent. Executing Tool: issueCoupon()");
      const toolCallId = "call_" + Math.random().toString().substring(7);
      
      // Default to asking for 50 or the requested amount
      const requestedAmt = extractedAmount || 50; 
      msg.toolCalls = [{ id: toolCallId, name: 'issueCoupon', args: { orderId: extractedOrderId, amount: requestedAmt }, status: 'pending' }];
      updateMessage({ ...msg });
      await sleep(1500);

      const res = ToolRegistry.issueCoupon(extractedOrderId!, requestedAmt, this.db);
      msg.toolCalls[0] = { ...msg.toolCalls[0], status: res.success ? 'success' : 'error', result: res };
      updateMessage({ ...msg });

      if (res.success) {
        this.onDbUpdate({ ...this.db });
        msg.content = `真不好意思让您遇到这个问题。我已经为您申请通过了 ${requestedAmt} 元的无门槛优惠券作为补偿，下次购买直接抵扣哦！`;
      } else {
        await addThought("Proportional Limit Exceeded. Auto-adjusting to max allowed.");
        msg.content = `实在抱歉，您要求的 ${requestedAmt} 元超出了我能直接为您发放的最高比例限制。要不我尽量为您申请最大额度的补偿券，或者您考虑一下换货？`;
      }

    } else if (intent === 'COMPENSATION_CASH') {
      await addThought("High-Risk Intent Detected. Delegating to Refund Agent. Executing Tool: applyForCashCompensation()");
      const toolCallId = "call_" + Math.random().toString().substring(7);
      const requestedAmt = extractedAmount || 100;
      
      msg.toolCalls = [{ id: toolCallId, name: 'applyForCashCompensation', args: { orderId: extractedOrderId, amount: requestedAmt }, status: 'pending' }];
      updateMessage({ ...msg });
      await sleep(2000);

      const res = ToolRegistry.applyForCashCompensation(extractedOrderId!, requestedAmt, this.db);
      msg.toolCalls[0] = { ...msg.toolCalls[0], status: res.success ? 'success' : 'error', result: res };
      updateMessage({ ...msg });

      if (res.success) {
        this.onDbUpdate({ ...this.db });
        msg.content = `由于您要求的是现金退回，我已经帮您向财务主管提交了 ${requestedAmt} 元的补偿审批工单。大概需要 1-3 个工作日审核，请留意支付宝到账通知哦。`;
      } else {
        await addThought("Guardrail Blocked: Item non-refundable. Formulating graceful rejection.");
        msg.content = `亲亲真的非常抱歉😭。我刚刚帮您去系统尝试申请现金退款了，但是您购买的这款【定制汉服】属于受保护的私人定制商品，进入裁缝阶段后依法不支持任何现金退款。您看要不我帮您向主管申请一张优惠券作为补偿？`;
      }

    } else {
      if (extractedOrderId) {
        await addThought("Order intent detected. Fetching order status from DB.");
        const order = this.db.orders.find(o => o.orderId === extractedOrderId);
        if (order) {
          msg.content = `帮您查到啦！您的订单 ${order.orderId} (${order.item}) 目前的状态是：【${order.status}】。您看还有什么我可以帮您的吗？`;
        } else {
          msg.content = `非常抱歉，在系统中没有为您查到订单 ${extractedOrderId}。`;
        }
      } else {
        msg.content = "您好！我是企业级智能客服中台。我可以帮您【查单改地址】或者处理【售后补偿】。请问您需要处理哪个订单？";
      }
    }

    updateMessage({ ...msg });
    onComplete(msg);
  }
}
