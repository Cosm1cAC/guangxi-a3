// 茶亭闲话: room chat panel with quick phrases and emoji, plus canned banter for practice bots.
export type ChatMsg = { id: number; seat: number; name: string; text: string };

export const QUICK = ['好牌！', '手下留情～', '队友在哪？', '这把稳了', '等等，我想想', '快点吧，茶都凉了', '承让承让', '再来一局！'];
export const EMOJI = ['🍵', '👍', '😂', '😮', '🎉', '🙏', '😭', '🧧'];

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export const banter = {
  bigPlay: ['看我的！', '这手怎么接？', '嘿嘿，接得住吗', '压箱底的牌来了'],
  praise: ['好牌！', '厉害厉害', '这手漂亮', '哎呀，被你压住了'],
  first: ['承让承让', '先走一步，茶给你们留着', '今天手气不错'],
  win: ['茶还热着，再来！', '赢得侥幸 🍵', '好山好水好牌友'],
  lose: ['下局翻盘！', '牌不好，人还在', '这局算你们的'],
  tribute: ['这张贡牌心疼啊', '拿去拿去', '下局要回来'],
  greet: ['来了来了', '江风正好，开局吧', '阿妹泡的茶真香'],
  reply(text: string) {
    if (/快|慢|等/.test(text)) return pick(['莫急莫急，牌要慢慢打', '马上马上', '想好了想好了']);
    if (/好|厉害|漂亮|👍/.test(text)) return pick(['过奖了', '哈哈，运气运气', '彼此彼此']);
    if (/队友|谁/.test(text)) return pick(['身份要藏好哦', '你猜？', '天机不可泄露']);
    if (/再来|一局/.test(text)) return pick(['来！', '奉陪到底', '今晚不醉不归']);
    if (/[😂🎉]/u.test(text)) return pick(['😂', '哈哈哈', '🎉']);
    return pick(['嗯嗯', '有道理', '🍵', '哈哈', '专心打牌～']);
  },
  pick,
};

export function createChat(root: HTMLElement, opts: { send: (text: string) => Promise<void>; onOpen?: () => void }) {
  root.innerHTML = `
  <header><div><b>茶亭闲话</b><small id="chat-sub">牌桌聊天</small></div><button class="chat-close" aria-label="收起聊天">×</button></header>
  <div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-label="聊天记录"><p class="chat-empty">江风徐来，说两句吧。</p></div>
  <div class="chat-quick">${QUICK.map(q => `<button type="button" data-say="${q}">${q}</button>`).join('')}</div>
  <div class="chat-emoji">${EMOJI.map(e => `<button type="button" data-say="${e}" aria-label="发送 ${e}">${e}</button>`).join('')}</div>
  <form class="chat-form"><input id="chat-input" maxlength="60" autocomplete="off" placeholder="说点什么…（回车发送）" aria-label="聊天内容"><button class="btn lacquer" type="submit">发送</button></form>
  <p class="chat-error" role="alert"></p>`;
  const log = root.querySelector<HTMLElement>('#chat-log')!, input = root.querySelector<HTMLInputElement>('#chat-input')!, err = root.querySelector<HTMLElement>('.chat-error')!;
  const ids = new Set<number>();
  let unread = 0, onUnread: (n: number) => void = () => {};
  const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  async function say(text: string) {
    text = text.trim(); if (!text) return; err.textContent = '';
    try { await opts.send(text); input.value = ''; } catch (e) { err.textContent = e instanceof Error ? e.message : '发送失败'; }
  }
  root.querySelector('form')!.addEventListener('submit', e => { e.preventDefault(); void say(input.value); });
  root.querySelectorAll<HTMLButtonElement>('[data-say]').forEach(b => b.onclick = () => void say(b.dataset.say!));
  root.querySelector<HTMLButtonElement>('.chat-close')!.onclick = () => api.close();
  const api = {
    get open() { return !root.hidden; },
    toggle() { root.hidden ? api.show() : api.close(); },
    show() { root.hidden = false; unread = 0; onUnread(0); log.scrollTop = log.scrollHeight; opts.onOpen?.(); setTimeout(() => input.focus({ preventScroll: true }), 50); },
    close() { root.hidden = true; },
    onUnread(cb: (n: number) => void) { onUnread = cb; },
    setSubtitle(s: string) { root.querySelector('#chat-sub')!.textContent = s; },
    clear() { ids.clear(); log.innerHTML = '<p class="chat-empty">江风徐来，说两句吧。</p>'; unread = 0; onUnread(0); },
    /** Append a message; returns false if it was already shown. */
    add(m: ChatMsg, mine: boolean, system = false) {
      if (ids.has(m.id)) return false; ids.add(m.id);
      log.querySelector('.chat-empty')?.remove();
      const emojiOnly = /^\p{Extended_Pictographic}{1,3}$/u.test(m.text);
      const el = document.createElement('div');
      el.className = system ? 'msg system' : `msg ${mine ? 'mine' : ''} seat-${m.seat}`;
      el.innerHTML = system ? esc(m.text) : `<span class="who">${esc(m.name)}</span><span class="text ${emojiOnly ? 'emoji' : ''}">${esc(m.text)}</span>`;
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      log.append(el); while (log.children.length > 120) log.firstElementChild!.remove();
      if (atBottom || mine) log.scrollTop = log.scrollHeight;
      if (!mine && !system && root.hidden) { unread++; onUnread(unread); }
      return true;
    },
  };
  return api;
}
export type Chat = ReturnType<typeof createChat>;
