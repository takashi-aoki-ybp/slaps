// ===== SLAPS i18n (EN / JA) =====
const I18N = {
  en: {
    // brand
    tagline: 'Nothing but slaps.',
    // intro
    introNote: 'A HIPHOP-only online jukebox.',
    introNoteSub: 'No algorithm. Just slaps.',
    introSub: 'The track the algorithm won\'t show you.',
    // buttons
    addTrack: '＋ Add Track',
    save: '♡ Save',
    saved: '♥ Saved',
    report: '⚐ Report',
    start: '▶ START',
    // submit modal
    modalTitle: 'Add Track',
    modalLead: "Paste a YouTube URL — that's all you need.<br>Details below are optional, but help others discover the track.",
    fieldUrl: 'YouTube URL',
    fieldUrlReq: '*required',
    fieldVibe: 'Vibe',
    fieldRegion: 'Region',
    fieldEra: 'Era',
    fieldName: 'Your Name',
    fieldNamePh: 'Name / Nickname',
    fieldComment: 'Comment',
    fieldCommentPh: 'What slaps about this track?',
    submitBtn: 'Add to Jukebox',
    submitNote: '※ Added tracks are immediately public.',
    notSet: '-- Not set --',
    optional: 'optional',
    // report modal
    reportTitle: 'Report Track',
    reportingPrefix: 'Reporting:',
    reportReason: 'Reason',
    reportDetailLabel: 'Details (optional)',
    reportDetailPh: 'Tell us more',
    reportBtn: 'Report',
    reportReasons: ['Inappropriate content', 'Video unavailable / deleted', 'Not HIPHOP', 'Duplicate', 'Other'],
    // fav modal
    favTitle: 'Saved Tracks',
    favLead: 'Saved to this device only. Not sent to any server.',
    favPlayAll: '▶ Play Saved Only',
    favEmpty: 'No saved tracks yet. Hit ♡ Save on a track you like.',
    // fav toast
    favToastMsg: '♥ Saved to this device only.<br>Not sent to server. Cleared if you clear browser data.',
    favToastDismiss: "Don't show again",
    // toast messages
    toastAdded: 'Added to the jukebox! 🎉',
    toastAddedLocal: 'Added! (saved to this device)',
    toastAddFail: 'Failed to add. Please try again later.',
    toastDuplicate: 'This track is already in the jukebox.',
    toastReported: 'Reported. Thanks for keeping SLAPS clean. 🙏',
    toastReportFail: 'Report failed. Please try again.',
    toastSkip: 'Skipping unavailable track…',
    toastNetwork: 'Connection issues. Please check your network.',
    toastYtFail: 'YouTube connection failed. Please check your network or try again.',
    // about
    aboutH1: 'Stumble upon tracks you never knew existed.',
    aboutP1: "You love HIPHOP, but you're tired of what the algorithm keeps pushing. Playlists on streaming services all sound the same. There must be better tracks out there in the world — you just can't find them.",
    aboutP2: '<strong>SLAPS</strong> was born from that frustration. Open it up, and a track hand-picked by someone who thought "this is fire" starts playing at random.',
    aboutH2algo: 'NO ALGORITHM. JUST SLAPS.',
    aboutPalgo: 'No recommendations. No history-based optimization. We don\'t track what you listen to. Discovery is completely random. <strong>Because stumbling upon music by chance is the best part.</strong>',
    aboutH2ct: 'CONSCIOUS ↔ TURNT',
    aboutPct: 'Even within HIPHOP, moods vary. Sometimes you want introspective, lyrical vibes. Sometimes you just want to go off. So instead of genres, we placed a single feel axis: <strong><span class="conscious">CONSCIOUS</span> (introspective) ↔ <span class="turnt">TURNT</span> (hype)</strong>. Center for everything, left for deep cuts, right for bangers.',
    aboutH2how: 'How to Use',
    aboutHow: [
      'Random play starts on open (muted at first — tap to unmute)',
      'Skip tracks with side buttons / arrow keys / swipe',
      '<span class="conscious">CONSCIOUS</span>↔<span class="turnt">TURNT</span> slider to filter by mood',
      '<svg class="about-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/></svg> to filter by country (US / JP / UK / FR / KR …)',
      '<svg class="about-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> to keep the UI visible (turn OFF to focus on the MV)',
      '<svg class="about-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg> to save (stored on this device only)',
      'Anyone can add a track — just paste a YouTube URL',
    ],
    aboutEnTitle: '',
    aboutEn: '',
    // meta
    postedBy: 'posted by',
    anon: 'Anonymous',
    // coach
    coachFill: 'Fill screen',
    coachPin: 'Keep UI visible',
    coachAbout: 'About',
    // filter feedback
    filterApplied: 'Filter applied. Next track will match.',
    noMatch: 'No tracks match these filters.',
    // vibe
    vibeNotSet: 'Not set',
    // tracks
    track: 'track',
    tracks: 'tracks',
  },
  ja: {
    tagline: 'Nothing but slaps.',
    introNote: 'HIPHOPに特化したオンラインジュークボックス。',
    introNoteSub: 'アルゴリズムなし。スラップだけ。',
    introSub: 'アルゴリズムじゃ出会えない一曲を。',
    addTrack: '＋ 曲を追加',
    save: '♡ 保存',
    saved: '♥ 保存済',
    report: '⚐ 報告',
    start: '▶ START',
    modalTitle: '曲を追加',
    modalLead: 'YouTube URLを貼るだけでOK。<br>以下の項目は任意ですが、入力すると他のユーザーが曲を見つけやすくなります。',
    fieldUrl: 'YouTube URL',
    fieldUrlReq: '*必須',
    fieldVibe: 'バイブス',
    fieldRegion: '地域',
    fieldEra: '年代',
    fieldName: 'あなたの名前',
    fieldNamePh: '名前 / ニックネーム',
    fieldComment: 'コメント',
    fieldCommentPh: 'この曲のヤバいポイントは？',
    submitBtn: 'ジュークボックスに追加',
    submitNote: '※ 追加した曲はすぐに公開されます。',
    notSet: '-- 未設定 --',
    optional: '任意',
    reportTitle: '曲を報告',
    reportingPrefix: '報告対象:',
    reportReason: '理由',
    reportDetailLabel: '詳細（任意）',
    reportDetailPh: '詳しく教えてください',
    reportBtn: '報告する',
    reportReasons: ['不適切なコンテンツ', '動画が利用不可 / 削除済み', 'HIPHOPではない', '重複', 'その他'],
    favTitle: '保存した曲',
    favLead: 'この端末にのみ保存されます。サーバーには送信されません。',
    favPlayAll: '▶ 保存した曲だけ再生',
    favEmpty: 'まだ保存した曲はありません。気に入った曲で ♡ をタップしてください。',
    favToastMsg: '♥ この端末にのみ保存されました。<br>サーバーには送信されません。ブラウザデータを消去すると削除されます。',
    favToastDismiss: '今後表示しない',
    toastAdded: 'ジュークボックスに追加しました！ 🎉',
    toastAddedLocal: '追加しました！（この端末に保存）',
    toastAddFail: '追加に失敗しました。もう一度お試しください。',
    toastDuplicate: 'この曲はすでにジュークボックスにあります。',
    toastReported: '報告しました。SLAPSをきれいに保ってくれてありがとう 🙏',
    toastReportFail: '報告に失敗しました。もう一度お試しください。',
    toastSkip: '再生できない曲をスキップしています…',
    toastNetwork: '接続に問題があります。ネットワークを確認してください。',
    toastYtFail: 'YouTube接続に失敗しました。ネットワークを確認するか、もう一度お試しください。',
    aboutH1: '知らなかった曲に、偶然ぶつかる場所。',
    aboutP1: 'アルゴリズムが勧めてくる曲はもう聴き飽きた。サブスクのプレイリストは同じような曲ばっかり。もっと良い曲が世界中にあるはずなのに、なかなか出会えない。',
    aboutP2: '<strong>SLAPS</strong>はそんな不満から生まれたんだ。アクセスしたら、誰かが「これヤバい」と思い、選んだ曲がランダムで流れだす。',
    aboutH2algo: 'NO ALGORITHM. JUST SLAPS.',
    aboutPalgo: 'レコメンドも、履歴の最適化もしない。あなたの聴いた曲は追跡しない。どう出会うかは、完全にランダム。<strong>偶然の出会いこそが、音楽の一番の醍醐味</strong>だから。',
    aboutH2ct: 'CONSCIOUS ↔ TURNT',
    aboutPct: 'HIPHOPの中でも気分は色々。内省的でリリカルな気分の時もあれば、とにかくアガりたい時もある。だからジャンルじゃなく、<strong><span class="conscious">CONSCIOUS</span>（内省的）↔ <span class="turnt">TURNT</span>（アッパー）</strong>という感覚軸だけ置いた。真ん中で全部、左で深い曲、右で上がる曲。',
    aboutH2how: '使い方',
    aboutHow: [
      '開いた瞬間にランダム再生',
      '左右のボタン／キー／スワイプで曲送り',
      '<span class="conscious">CONSCIOUS</span>↔<span class="turnt">TURNT</span> のバーで気分を絞る',
      '<svg class="about-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/></svg> で国を絞る（US / JP / UK / FR / KR …）',
      '<svg class="about-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> でUIを常時表示（MVに集中したい時はOFF）',
      '気に入ったら <svg class="about-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg> で保存（この端末だけに残る）',
      '好きな曲はYouTubeのURLを貼るだけで誰でも追加OK',
    ],
    aboutEnTitle: 'About (English)',
    aboutEn: '<strong>SLAPS</strong> is a HIPHOP-only online jukebox. No recommendations, no history-based optimization — just tracks picked by real people, played at random. One feel axis: <span class="conscious">CONSCIOUS</span> ↔ <span class="turnt">TURNT</span>. Filter by region, save favorites locally, add your own track by pasting a YouTube URL. No rules. If it slaps, it belongs here.',
    postedBy: 'posted by',
    anon: '匿名',
    coachFill: '画面拡大',
    coachPin: 'UI常時表示',
    coachAbout: '使い方',
    filterApplied: 'フィルター適用。次の曲から反映されます。',
    noMatch: '条件に一致する曲がありません。',
    vibeNotSet: '未設定',
    track: '曲',
    tracks: '曲',
  },
};

const i18n = (() => {
  let lang = localStorage.getItem('slaps_lang') || 'ja';

  function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }
  function getLang() { return lang; }

  function setLang(l) {
    lang = l;
    localStorage.setItem('slaps_lang', l);
    document.documentElement.lang = l;
    applyAll();
  }

  function applyAll() {
    // UI buttons
    const submitOpen = $('#submitOpen');
    if (submitOpen) submitOpen.textContent = t('addTrack');
    if (typeof renderFavBtn === 'function') renderFavBtn();
    const reportBtn = $('#reportBtn');
    if (reportBtn) reportBtn.textContent = t('report');

    // intro (if still in DOM)
    const introSub = $('#introSub');
    if (introSub) introSub.textContent = t('introSub');

    // submit modal
    $('#submitModal .modal__h').textContent = t('modalTitle');
    $('#submitModal .modal__lead').innerHTML = t('modalLead');
    document.querySelector('#ytUrl').closest('.field').querySelector('span').innerHTML = `${t('fieldUrl')} <span class="field__req">${t('fieldUrlReq')}</span>`;
    // field labels
    const vibeField = document.querySelector('#ytBalance')?.closest('.field');
    if (vibeField) vibeField.querySelector(':scope > span').textContent = t('fieldVibe');
    const regionField = document.querySelector('#ytRegion')?.closest('.field');
    if (regionField) {
      const lbl = regionField.querySelector(':scope > span');
      lbl.innerHTML = `${t('fieldRegion')} <span class="field__opt">${t('optional')}</span>`;
    }
    const eraField = document.querySelector('#ytEra')?.closest('.field');
    if (eraField) {
      const lbl = eraField.querySelector(':scope > span');
      lbl.innerHTML = `${t('fieldEra')} <span class="field__opt">${t('optional')}</span>`;
    }
    const nameField = document.querySelector('#ytName')?.closest('.field');
    if (nameField) {
      const lbl = nameField.querySelector(':scope > span');
      lbl.innerHTML = `${t('fieldName')} <span class="field__opt">${t('optional')}</span>`;
    }
    const commentField = document.querySelector('#ytComment')?.closest('.field');
    if (commentField) {
      const lbl = commentField.querySelector(':scope > span');
      lbl.innerHTML = `${t('fieldComment')} <span class="field__opt">${t('optional')}</span>`;
    }
    $('#submitDo').textContent = t('submitBtn');
    $('#submitModal .modal__note').textContent = t('submitNote');
    $('#ytName').placeholder = t('fieldNamePh');
    $('#ytComment').placeholder = t('fieldCommentPh');

    // select options (Region)
    const regSel = $('#ytRegion');
    if (regSel) regSel.querySelector('option[value=""]').textContent = t('notSet');
    // select options (Era)
    const eraSel = $('#ytEra');
    if (eraSel) eraSel.querySelector('option[value=""]').textContent = t('notSet');

    // vibe notSet label
    const vibeVal = $('#ytConsTurntVal');
    if (vibeVal && !vibeVal.textContent.match(/\d/)) vibeVal.textContent = t('vibeNotSet');

    // report modal
    $('#reportModal .modal__h').textContent = t('reportTitle');
    const reportReasonLabel = document.querySelector('#reportReason')?.closest('.field')?.querySelector(':scope > span');
    if (reportReasonLabel) reportReasonLabel.textContent = t('reportReason');
    const reportDetailField = document.querySelector('#reportNote')?.closest('.field');
    if (reportDetailField) {
      reportDetailField.querySelector(':scope > span').textContent = t('reportDetailLabel');
      $('#reportNote').placeholder = t('reportDetailPh');
    }
    const reasons = t('reportReasons');
    const sel = $('#reportReason');
    sel.innerHTML = reasons.map(r => `<option>${r}</option>`).join('');
    const reportDoBtn = $('#reportDo');
    if (reportDoBtn) reportDoBtn.textContent = t('reportBtn');

    // fav modal
    $('#favModal .modal__h').textContent = t('favTitle');
    $('#favModal .modal__lead').textContent = t('favLead');
    $('#favPlayAll').textContent = t('favPlayAll');
    $('#favEmpty').textContent = t('favEmpty');

    // fav toast
    $('#favToast .fav-toast__msg').innerHTML = t('favToastMsg');
    const dismissLabel = document.querySelector('#favToastDismiss')?.parentElement;
    if (dismissLabel) {
      const checkbox = dismissLabel.querySelector('input');
      dismissLabel.textContent = '';
      dismissLabel.appendChild(checkbox);
      dismissLabel.append(` ${t('favToastDismiss')}`);
    }

    // about
    const ov = $('#aboutOverlay .about-ov__inner');
    if (ov) {
      ov.querySelector('h1').innerHTML = t('aboutH1');
      const ps = ov.querySelectorAll('.lead');
      if (ps[0]) ps[0].innerHTML = t('aboutP1');
      if (ps[1]) ps[1].innerHTML = t('aboutP2');
      const h2s = ov.querySelectorAll('h2');
      if (h2s[0]) h2s[0].textContent = t('aboutH2algo');
      const paras = ov.querySelectorAll('p:not(.lead):not(.tag):not(.about-ov__logo)');
      if (paras[0]) paras[0].innerHTML = t('aboutPalgo');
      if (h2s[1]) h2s[1].textContent = t('aboutH2ct');
      if (paras[1]) paras[1].innerHTML = t('aboutPct');
      if (h2s[2]) h2s[2].textContent = t('aboutH2how');
      const ul = ov.querySelector('ul');
      if (ul) ul.innerHTML = t('aboutHow').map(li => `<li>${li}</li>`).join('');
      // English section
      const enSection = ov.querySelector('.en');
      if (enSection) enSection.style.display = lang === 'ja' ? '' : 'none';
    }

    // lang toggle: swap is-active between JP and EN
    const langBtn = $('#langBtn');
    if (langBtn) {
      langBtn.querySelectorAll('.lang-opt').forEach(opt => {
        opt.classList.toggle('is-active', opt.dataset.lang === lang);
      });
    }

    // update track count
    if (typeof updateTrackCount === 'function') updateTrackCount();

    // update description for current song (lang switch)
    const descEl = $('#metaDesc');
    if (descEl && typeof current === 'function') {
      const song = current();
      if (song && song.description) {
        let desc = '';
        if (typeof song.description === 'string') {
          desc = song.description;
        } else {
          desc = song.description[lang] || song.description.en || song.description.ja || '';
        }
        descEl.textContent = desc;
        descEl.hidden = !desc;
      }
    }

    // update posted-by label
    const metaUser = $('#metaUser');
    if (metaUser && typeof current === 'function') {
      const song = current();
      if (song && song.user_name) metaUser.textContent = `${t('postedBy')} ${song.user_name}`;
    }
  }

  return { t, getLang, setLang, applyAll };
})();
