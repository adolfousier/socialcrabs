export interface HumanizerZhOptions {
  account?: string;
  variant?: number;
}

const AI_TELL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/这不仅是(.+?)，?更是/u, '$1，也会带来'],
  [/不仅是(.+?)，?更是/u, '$1，也会带来'],
  [/真正值得看的[，,]?/g, '我会看'],
  [/标志性事件/g, '大事'],
  [/重要里程碑/g, '一个信号'],
  [/关键节点/g, '转折点'],
  [/底层逻辑/g, '背后的东西'],
  [/深度重估/g, '重新定价'],
  [/产业链重估/g, '产业重新定价'],
  [/短期看情绪，?后面还是看兑现/g, '先看真实反馈'],
  [/短期会吵，?最后还是看使用频率/g, '先看能不能被反复使用'],
  [/短线看预期，?过一阵子还是要回到数字/g, '数据迟早会把故事拆开'],
  [/后面能不能兑现/g, '接下来怎么落地'],
];

export function applyHumanizerZh(input: string, options: HumanizerZhOptions = {}): string {
  let text = input.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of AI_TELL_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  text = text
    .replace(/这件事的一个/g, '这件事')
    .replace(/一个这件事/g, '一件事')
    .replace(/也算是行业/g, '也让行业')
    .replace(/，不是短期炒多高，而是/g, '，我更关心')
    .replace(/不是短期炒多高，而是/g, '我更关心')
    .replace(/不是故事讲得最大的人，而是/g, '是')
    .replace(/很多事情/g, '有些事')
    .replace(/\s+/g, ' ')
    .trim();

  const paragraphs = splitSentences(text);
  const compact = paragraphs.length > 0 ? paragraphs : [text];
  const account = (options.account || '').replace(/^@/, '');
  const aside = pickAside(account, text, options.variant || 0);
  const output = compact.length >= 2 ? compact.slice(0, 2) : [compact[0], aside];
  if (account && output.length >= 2) {
    output[1] = `${output[1].replace(/[。！？!?]+$/u, '')}，${aside}`;
  }
  return output
    .map((item) => item.trim().replace(/[。！？!?]+$/u, ''))
    .filter(Boolean)
    .join('。\n\n')
    .replace(/。?$/u, '。');
}

export function stableTextIndex(text: string, variant: number, modulo: number): number {
  let hash = Math.abs(variant);
  for (const char of text) {
    hash = (hash * 31 + (char.codePointAt(0) || 0)) >>> 0;
  }
  return hash % modulo;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])/u)
    .map((item) => item.trim().replace(/[。！？!?]+$/u, ''))
    .filter(Boolean);
}

function pickAside(account: string, text: string, variant: number): string {
  const normalized = text.toLowerCase();
  const pool = /税|税制|税率|收入|打工|创业|经商|资本积累|资本收入|资产/i.test(normalized)
    ? ['税制是在分配激励，收入和资产被怎么对待，人的选择就会跟着变', '打工收入和资本回报被区别对待，最后影响的是普通人的路径选择', '看一个地方鼓励什么，税表往往比口号更诚实']
    : /ai|claude|模型|智能体|agent|算力/i.test(normalized)
    ? ['先看它会不会被普通人真的用起来', '更值得盯的是它能不能嵌进具体工作', '我会关注它从演示走到日常的速度']
    : /btc|eth|币安|binance|加密|crypto|链|代币/i.test(normalized)
      ? ['流动性是一层，真实需求才更难伪装', '价格反应很快，链上和资金会给第二层答案', '这类事我会先看资金往哪边挪']
      : /美股|股票|财报|利润|营收|ceo|公司|市场|估值/i.test(normalized)
        ? ['财报、现金流和用户增长会把故事拆开看', '估值可以抢跑，业务数据会慢慢验货', '最好把它放回公司基本面里看']
        : account === 'blockheadchain_'
          ? ['说白了，别看概念，先看它会不会改变人的真实选择', '我会先拆它影响谁的成本，谁又多了新空间', '如果只是热闹不会留下来，能改路径才算真变化']
          : ['这类变化最后会反映到成本、效率和人的选择里', '我更想看它改变了谁的成本，又让谁多了选择', '别只看表面热闹，先拆它影响的是哪一层利益'];
  return pool[stableTextIndex(`${account}:${text}`, variant, pool.length)];
}
