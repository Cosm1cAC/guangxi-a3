import { api, session } from './account';

export function startPresence(element: HTMLElement) {
  let visitor = localStorage.getItem('a3-visitor');
  if (!visitor || !/^[a-f0-9]{32}$/.test(visitor)) {
    visitor = [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('a3-visitor', visitor);
  }
  let busy = false;
  const refresh = async () => {
    if (document.hidden || busy) return;
    busy = true;
    try {
      const status = await api<{online: number; capacity: number}>('/presence', {visitorId: visitor});
      element.textContent = `在线 ${status.online}/${status.capacity}`;
      element.title = '当前在线人数 / 服务器配置容量。最近 60 秒活跃，同账号多设备算一人。';
    } catch { element.textContent = '在线 --/--'; element.title = '暂时无法获取在线人数'; }
    finally { busy = false; }
  };
  void refresh();
  setInterval(() => void refresh(), 20000);
  document.addEventListener('visibilitychange', () => void refresh());
  session.onChange(() => void refresh());
}
