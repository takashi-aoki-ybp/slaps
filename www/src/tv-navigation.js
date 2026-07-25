// tv-navigation.js
// Fire TV Stick リモコンによる空間ナビゲーション（D-pad操作）を可能にするスクリプト

document.addEventListener('DOMContentLoaded', () => {
  // TV環境かどうかの簡易判定
  const isTV = /Tizen|Web0S|WebOS|SMART-TV|SmartTV|AFTT|AFTN|AFTS|AFTB|FireTV/i.test(navigator.userAgent);
  if (!isTV) {
    // TV以外ではD-padナビゲーションを無効化（PCの矢印キーでの曲スキップ等を妨害しないため）
    return;
  }

  // フォーカス可能な要素のセレクタ
  const FOCUSABLE_SELECTOR = 'button, [tabindex="0"], a, input, select, textarea';

  function getFocusableElements() {
    return Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el => {
      // 無効化されている要素やtabindexが-1のものは除外
      if (el.disabled || el.tabIndex === -1) return false;
      
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      
      // 親要素が非表示（モーダル等）になっていないかチェック
      let parent = el.parentElement;
      while (parent) {
        if (parent.hasAttribute('hidden') || window.getComputedStyle(parent).display === 'none') {
          return false;
        }
        parent = parent.parentElement;
      }
      return el.offsetWidth > 0 && el.offsetHeight > 0;
    });
  }

  function getCenter(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function navigate(direction) {
    const active = document.activeElement;
    const candidates = getFocusableElements();

    // アクティブな要素がない場合は、最初のフォーカス可能な要素にフォーカス
    if (!active || active === document.body) {
      if (candidates.length > 0) {
        candidates[0].focus();
      }
      return;
    }

    const activeRect = active.getBoundingClientRect();
    const activeCenter = getCenter(activeRect);

    let bestCandidate = null;
    let minDistance = Infinity;

    for (const cand of candidates) {
      if (cand === active) continue;

      const candRect = cand.getBoundingClientRect();
      const candCenter = getCenter(candRect);

      const dx = candCenter.x - activeCenter.x;
      const dy = candCenter.y - activeCenter.y;

      let isCandidate = false;
      let primaryDist = 0;
      let secondaryDist = 0;

      // 方向に応じたターゲット判定
      switch (direction) {
        case 'left':
          if (candCenter.x < activeCenter.x) {
            isCandidate = true;
            primaryDist = activeCenter.x - candCenter.x;
            secondaryDist = Math.abs(dy);
          }
          break;
        case 'right':
          if (candCenter.x > activeCenter.x) {
            isCandidate = true;
            primaryDist = candCenter.x - activeCenter.x;
            secondaryDist = Math.abs(dy);
          }
          break;
        case 'up':
          if (candCenter.y < activeCenter.y) {
            isCandidate = true;
            primaryDist = activeCenter.y - candCenter.y;
            secondaryDist = Math.abs(dx);
          }
          break;
        case 'down':
          if (candCenter.y > activeCenter.y) {
            isCandidate = true;
            primaryDist = candCenter.y - activeCenter.y;
            secondaryDist = Math.abs(dx);
          }
          break;
      }

      if (isCandidate) {
        // 距離の計算（同一方向軸上の要素を優先するため、方向の差分に大きな重みをかける）
        const dist = primaryDist + secondaryDist * 2.5;
        if (dist < minDistance) {
          minDistance = dist;
          bestCandidate = cand;
        }
      }
    }

    if (bestCandidate) {
      bestCandidate.focus();
    }
  }

  // キーボードイベントハンドラー
  window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    
    // 音量や conscious/turnt のスライダー（range）を操作しているときは左右キーによるフォーカス移動を抑止
    if (active && active.tagName === 'INPUT' && active.type === 'range') {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        return; // スライダーのネイティブ操作に任せる
      }
    }

    switch (e.key) {
      case 'ArrowUp':
        navigate('up');
        e.preventDefault();
        break;
      case 'ArrowDown':
        navigate('down');
        e.preventDefault();
        break;
      case 'ArrowLeft':
        navigate('left');
        e.preventDefault();
        break;
      case 'ArrowRight':
        navigate('right');
        e.preventDefault();
        break;
      case 'Enter':
        // WebView上のボタンによってはEnterで発火しないケースがあるため、clickをトリガー
        if (active && active.tagName !== 'INPUT' && active.tagName !== 'SELECT' && active.tagName !== 'TEXTAREA') {
          active.click();
        }
        break;
    }
  });

  // 起動1秒後に最初のフォーカスを自動で設定
  setTimeout(() => {
    const candidates = getFocusableElements();
    if (candidates.length > 0) {
      candidates[0].focus();
    }
  }, 1000);
});
