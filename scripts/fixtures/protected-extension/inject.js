if (location.pathname === '/protected') document.addEventListener('focusin', (event) => {
  if (event.target.id !== 'secret' || document.getElementById('protected-menu')) return;
  const frame = document.createElement('iframe'); frame.id = 'protected-menu'; frame.src = chrome.runtime.getURL('menu.html'); document.body.append(frame);
  setTimeout(() => frame.remove(), 15000);
});
