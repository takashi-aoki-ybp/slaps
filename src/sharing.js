// A resolved Web Share API is not proof that a recipient received a post.
export async function deliverShare(text, nav = navigator, doc = document) {
  const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(nav.userAgent);
  if (mobile && nav.share) {
    try {
      await nav.share({ text });
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await nav.clipboard.writeText(text);
    return 'copied';
  } catch {
    const input = doc.createElement('input');
    input.value = text;
    input.style.position = 'absolute';
    input.style.opacity = '0';
    doc.body.appendChild(input);
    input.select();
    try { return doc.execCommand('copy') ? 'copied' : 'failed'; }
    catch { return 'failed'; }
    finally { input.remove(); }
  }
}
