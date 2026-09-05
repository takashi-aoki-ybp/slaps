// ===== SLAPS i18n (EN / JA) =====
const $ = (sel) => document.querySelector(sel);

const I18N = {
  en: {
    // brand
    tagline: 'Nothing but slaps.',
    // intro
    introNote: 'A HIPHOP-only online station.',
    introNoteSub: 'No algorithm. Just slaps.',
    introSub: 'The track the algorithm won\'t show you.',
    // buttons
    addTrack: '＋ Add Track',
    save: '♡ Save',
    saved: '♥ Saved',
    favOpen: 'Saved',
    favOpenActive: 'Back to All',
    share: '🔗 Share Track',
    shareCopied: 'Link copied to clipboard!',
    report: '⚐ Report',
    start: '▶ START',
    dailyOpen: 'NEW TODAY',
    dailyPlayAll: '▶ PLAY ALL {count}',
    dailyShare: '↗ SHARE THIS DROP',
    dailyShareText: "SLAPS DAILY DROP — {date} / {count} tracks",
    dailyLead: 'Ten tracks added today. Play them straight through.',
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
    submitBtn: 'Add to Station',
    submitNote: '※ Published immediately after video and duplicate checks.',
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
    favLead: 'Your saved list stays on this device. Save actions are measured to improve SLAPS.',
    favPlayAll: '▶ Play Saved Only',
    crateShare: '🔗 Share Saved Tracks',
    crateShareText: 'Listen to my {count} saved tracks on SLAPS',
    crateNote: 'The shared URL contains the selected YouTube IDs. Your saved list stays on this device; playback and save events are measured to improve SLAPS.',
    crateExit: 'Exit Shared Tracks',
    crateLoaded: 'Loaded {count} shared tracks.',
    favEmpty: 'No saved tracks yet. Hit ♡ Save on a track you like.',
    // fav toast
    favToastMsg: '♥ Saved to this device only.<br>Not sent to server. Cleared if you clear browser data.',
    favToastDismiss: "Don't show again",
    // toast messages
    toastAdded: 'Track added!<br>Try listening from LATEST! 🎉',
    toastAddedLocal: 'Added! (saved to this device)',
    toastAddFail: 'Failed to add. Please try again later.',
    toastDuplicate: 'Thank you! This track is already registered!',
    toastReported: 'Reported. Thanks for keeping SLAPS clean. 🙏',
    toastReportFail: 'Report failed. Please try again.',
    toastSkip: 'Skipping unavailable track…',
    toastNetwork: 'Connection issues. Please check your network.',
    toastBackToAll: 'Returned to all tracks.',
    toastYtFail: 'YouTube connection failed. Please check your network or try again.',
    introRetry: 'TRY AGAIN',
    introRetryHint: 'The video is taking a while to start. Check your connection or try again.',
    toastCatalogFail: 'Tracks could not be loaded. Check your connection and press START to retry.',
    toastFavoritesSession: 'Device storage is unavailable. This save will last for this session only.',
    toastWait: 'Thank you!',
    confirmPlayTitle: 'Track Added!',
    confirmPlayDesc: 'Would you like to play this track right now?',
    confirmPlayYes: 'Play Now',
    confirmPlayNo: 'Keep Listening',
    toastAddedNoPlay: 'Thank you! Available to listen from LATEST! 🎉',
    tryBroaderFilters: ' Try broadening your filters.',
    // about
    aboutH1: 'Stumble upon tracks you never knew existed.',
    aboutP1: "You love HIPHOP, but you're tired of what the algorithm keeps pushing. Playlists on streaming services all sound the same. There must be better tracks out there in the world — you just can't find them.",
    aboutP2: '<strong>SLAPS</strong> was born from that frustration. A muted video hand-picked by someone who thought "this is fire" starts immediately at random. START enables sound.',
    aboutH2algo: 'NO ALGORITHM. JUST SLAPS.',
    aboutPalgo: 'No personalized feed and no history-based optimization. We don\'t profile what you listen to. Tracks start at random; DIG only opens when you choose to explore further. <strong>Because stumbling upon music by chance is the best part.</strong>',
    aboutH2how: 'How to Use',
    aboutHow: [
      'A muted track starts playing at random when the page opens',
      'Tap START to enable sound',
      'Skip tracks with side buttons / arrow keys / swipe',
      'Use the country filter to narrow tracks (US / JP / UK / FR / KR …)',
      'Use Fill Screen to make the video fill the display (the edges may be cropped)',
      '<span class="about-badge">UI</span> to keep the UI visible (turn OFF to focus on the MV)',
      'Tap ♡ Save to keep a track on this device only',
      'Share saved tracks with a link — no account required',
      'Use DIG to explore related and unregistered tracks when you want to dig deeper',
      'Paste a YouTube URL to add a track; it goes live immediately after video and duplicate checks',
      'The live online count uses an anonymous device ID and current YouTube ID. Playback and save events are also measured to improve SLAPS, not to personalize the shuffle',
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
    // commentary
    comment: '💬 Comment',
    commentTitle: 'Post Commentary',
    commentLead: 'Post thoughts, trivia, or lyric interpretations tied to the exact timing of this song.',
    commentTimeLabel: 'Time (seconds)',
    commentTimeSec: 'sec',
    commentTimeFetch: 'Get current time',
    commentNamePh: 'Name / Nickname',
    commentTextReq: '*required (max 140 chars)',
    commentDoBtn: 'Post Comment',
    toastCommentAdded: 'Comment added!',
    toastCommentFail: 'Failed to post comment.',
    promoBadgeText: 'PROMO: New Arrival',
    recommendEmpty: 'No other unregistered tracks found for this artist. Share your favorite with us!',
  },
  ja: {
    tagline: 'Nothing but slaps.',
    introNote: 'HIPHOPに特化したオンライン・ステーション。',
    introNoteSub: 'アルゴリズムなし。スラップだけ。',
    introSub: 'アルゴリズムじゃ出会えない一曲を。',
    addTrack: '＋ 曲を追加',
    save: '♡ 保存',
    saved: '♥ 保存済',
    favOpen: '保存した曲を再生',
    favOpenActive: '全曲再生に戻る',
    share: '🔗 曲を共有',
    shareCopied: 'リンクをクリップボードにコピーしました！',
    report: '⚐ 報告',
    start: '▶ START',
    dailyOpen: 'NEW TODAY',
    dailyPlayAll: '▶ {count}曲を通して聴く',
    dailyShare: '↗ 今日の10曲を共有',
    dailyShareText: 'SLAPS 今日の10曲 — {date} / {count}曲',
    dailyLead: '今日入った10曲。上から、そのまま聴く。',
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
    submitBtn: 'ステーションに追加',
    submitNote: '※ 動画と重複を確認後、すぐに公開されます。',
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
    favLead: '保存リストはこの端末に残ります。保存操作はサービス改善のために計測しています。',
    favPlayAll: '▶ 保存した曲だけ再生',
    crateShare: '🔗 保存した曲を共有',
    crateShareText: 'SLAPSで保存した{count}曲を聴く',
    crateNote: '共有URLには選んだ曲のYouTube IDが含まれます。保存リストはこの端末に残り、再生・保存の操作はサービス改善のために計測しています。',
    crateExit: '共有リストを終了',
    crateLoaded: '共有された{count}曲を読み込みました',
    favEmpty: 'まだ保存した曲はありません。気に入った曲で ♡ をタップしてください。',
    favToastMsg: '♥ この端末にのみ保存されました。<br>サーバーには送信されません。ブラウザデータを消去すると削除されます。',
    favToastDismiss: '今後表示しない',
    toastAdded: '曲を追加しました！<br>LATEST（新着順）から聴いてみてください！ 🎉',
    toastAddedLocal: '追加しました！（この端末に保存）',
    toastAddFail: '追加に失敗しました。もう一度お試しください。',
    toastDuplicate: 'ありがとう！この曲はすでに登録されています！',
    toastReported: '報告しました。SLAPSをきれいに保ってくれてありがとう 🙏',
    toastReportFail: '報告に失敗しました。もう一度お試しください。',
    toastSkip: '再生できない曲をスキップしています…',
    toastNetwork: '接続に問題があります。ネットワークを確認してください。',
    toastBackToAll: '全体再生に戻りました。',
    toastYtFail: 'YouTube接続に失敗しました。ネットワークを確認するか、もう一度お試しください。',
    introRetry: '再試行',
    introRetryHint: '動画の開始に時間がかかっています。通信を確認するか、再試行してください。',
    toastCatalogFail: '曲を読み込めませんでした。通信を確認し、STARTを押すと再試行できます。',
    toastFavoritesSession: '端末に保存できないため、この画面を閉じるまでの一時保存になります。',
    toastWait: 'ありがとうございます！',
    confirmPlayTitle: '追加完了しました！',
    confirmPlayDesc: 'すぐにこの曲を再生しますか？',
    confirmPlayYes: '今すぐ再生する',
    confirmPlayNo: 'このまま今の曲を聴く',
    toastAddedNoPlay: 'ありがとうございます。LATESTから聴けます！ 🎉',
    tryBroaderFilters: ' フィルターを広げてみてください。',
    aboutH1: '知らなかった曲に、偶然ぶつかる場所。',
    aboutP1: 'アルゴリズムが勧めてくる曲はもう聴き飽きた。サブスクのプレイリストは同じような曲ばっかり。もっと良い曲が世界中にあるはずなのに、なかなか出会えない。',
    aboutP2: '<strong>SLAPS</strong>はそんな不満から生まれたんだ。ページを開くと、誰かが「これヤバい」と思って選んだ曲が、すぐランダムに映像で流れだす。STARTは音を出すためのボタン。',
    aboutH2algo: 'NO ALGORITHM. JUST SLAPS.',
    aboutPalgo: 'あなた専用のレコメンドも、履歴による最適化もしない。聴いた曲からあなたを分析しない。曲との出会いはランダムで、もっと掘りたい時だけ自分でDIGする。<strong>偶然の出会いこそが、音楽の一番の醍醐味</strong>だから。',
    aboutH2how: '使い方',
    aboutHow: [
      'ページを開くと、ミュートのままランダム再生が始まる',
      'STARTを押すと音が出る',
      '左右のボタン／キー／スワイプで曲送り',
      '国フィルターで曲を絞る（US / JP / UK / FR / KR …）',
      '画面拡大で映像を画面いっぱいに表示（端が切れる場合あり）',
      '<span class="about-badge">UI</span> でUIを常時表示（MVに集中したい時はOFF）',
      '気に入った曲は ♡ 保存（この端末だけに残る）',
      '保存した曲をログインなしのリンクで共有',
      'もっと掘りたい時はDIGから関連曲・未登録曲を探す',
      'YouTube URLを貼って曲を追加。動画と重複を確認後、すぐ公開',
      '同時接続数のために匿名の端末IDと再生中のYouTube IDを送信。再生・保存などの操作も改善のために計測しますが、シャッフルの個人別最適化には使いません',
    ],
    aboutEnTitle: 'About (English)',
    aboutEn: '<strong>SLAPS</strong> is a HIPHOP-only online station. A muted video picked by a real person starts immediately at random; START enables sound. There is no personalized feed or history-based optimization. Use DIG when you want to explore further, or share saved tracks with a link. Paste a YouTube URL to add a track after automatic checks.',
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
    // commentary
    comment: '💬 コメント',
    commentTitle: 'コメンタリーを投稿',
    commentLead: '曲の再生タイミングに合わせた叫びやトリビアを投稿できます。',
    commentTimeLabel: 'コメントする時間 (秒)',
    commentTimeSec: '秒付近',
    commentTimeFetch: '現在の再生秒数を取得',
    commentNamePh: '名前 / ニックネーム',
    commentTextReq: '*必須（140字以内）',
    commentDoBtn: 'コメントを投稿',
    toastCommentAdded: 'コメントを投稿しました！',
    toastCommentFail: 'コメントの投稿に失敗しました。',
    promoBadgeText: 'PROMO: 新曲が入荷しました',
    recommendEmpty: 'このアーティストの他の未登録曲が見つかりませんでした。君の知っているおすすめを登録してね！',
  },
};

const i18n = (() => {
  let lang = 'ja';
  try { const saved = localStorage.getItem('slaps_lang'); if (saved === 'ja' || saved === 'en') lang = saved; } catch {}

  function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }
  function getLang() { return lang; }

  function setLang(l) {
    lang = l;
    try { localStorage.setItem('slaps_lang', l); } catch { /* language still works for this session */ }
    document.documentElement.lang = l;
    applyAll();
  }

  function applyAll() {
    // H-10: lang属性をブート時にも同期
    document.documentElement.lang = getLang();
    // UI buttons
    const submitOpen = $('#submitOpen');
    if (submitOpen) submitOpen.textContent = t('addTrack');
    if (typeof renderFavBtn === 'function') renderFavBtn();
    const shareBtn = $('#shareBtn');
    if (shareBtn) shareBtn.textContent = t('share');
    const reportBtn = $('#reportBtn');
    if (reportBtn) reportBtn.textContent = t('report');
    const isJa = getLang() === 'ja';
    const closeLabel = isJa ? '閉じる' : 'Close';
    document.querySelectorAll('.modal__close, .about-ov__close').forEach((button) => button.setAttribute('aria-label', closeLabel));
    $('#digOpen')?.setAttribute('aria-label', isJa ? 'DIG SLAPSを開く' : 'Open DIG SLAPS');
    $('#dailyOpen')?.setAttribute('aria-label', isJa ? '今日の10曲を開く' : "Open today's tracks");
    if ($('#dailyLead')) $('#dailyLead').textContent = t('dailyLead');
    if ($('#dailyShare')) $('#dailyShare').textContent = t('dailyShare');
    if (typeof window.refreshDaily === 'function') window.refreshDaily();
    $('#regions')?.setAttribute('aria-label', isJa ? '地域フィルター' : 'Region filter');
    $('#eras')?.setAttribute('aria-label', isJa ? '年代フィルター' : 'Era filter');
    $('#order')?.setAttribute('aria-label', isJa ? '再生順' : 'Playback order');
    $('#prevBtn')?.setAttribute('aria-label', isJa ? '前の曲' : 'Previous track');
    $('#nextBtn')?.setAttribute('aria-label', isJa ? '次の曲' : 'Next track');
    $('#playBtn')?.setAttribute('aria-label', isJa ? '再生 / 一時停止' : 'Play / Pause');

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
    $('#crateShare').textContent = t('crateShare');
    $('#crateNote').textContent = t('crateNote');
    $('#favEmpty').textContent = t('favEmpty');
    if (typeof window.updateFavCount === 'function') window.updateFavCount();

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
      if (h2s[1]) h2s[1].textContent = t('aboutH2how');
      const ul = ov.querySelector('ul');
      if (ul) ul.innerHTML = t('aboutHow').map(li => `<li>${li}</li>`).join('');
      // English section
      const enSection = ov.querySelector('.en');
      if (enSection) {
        const enTitle = enSection.querySelector('h2');
        const enBody = enSection.querySelector('p');
        if (enTitle) enTitle.textContent = t('aboutEnTitle');
        if (enBody) enBody.innerHTML = t('aboutEn');
        enSection.style.display = lang === 'ja' ? '' : 'none';
      }
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
    if (typeof window.updateFavCount === 'function') window.updateFavCount();

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

    // commentBtn
    const commentBtn = $('#commentOpen');
    if (commentBtn) commentBtn.textContent = t('comment');

    // comment modal
    const commentModal = $('#commentModal');
    if (commentModal) {
      commentModal.querySelector('.modal__h').textContent = t('commentTitle');
      commentModal.querySelector('.modal__lead').innerHTML = t('commentLead');
      commentModal.querySelector('.field span').textContent = t('commentTimeLabel');
      commentModal.querySelector('.time-selector span').textContent = t('commentTimeSec');
      commentModal.querySelector('#commentTimeFetch').textContent = t('commentTimeFetch');
      
      const commentNameField = commentModal.querySelector('#commentName')?.closest('.field');
      if (commentNameField) {
        commentNameField.querySelector(':scope > span').innerHTML = `${t('fieldName')} <span class="field__opt">${t('optional')}</span>`;
      }
      const commentTextField = commentModal.querySelector('#commentText')?.closest('.field');
      if (commentTextField) {
        commentTextField.querySelector(':scope > span').innerHTML = `${t('fieldComment')} <span class="field__req">${t('commentTextReq')}</span>`;
      }
      $('#commentDo').textContent = t('commentDoBtn');
      $('#commentName').placeholder = t('fieldNamePh');
      $('#commentText').placeholder = t('fieldCommentPh');
    }

    // update posted-by label
    const metaUser = $('#metaUser');
    if (metaUser && typeof current === 'function') {
      const song = current();
      if (song && song.user_name) metaUser.textContent = `${t('postedBy')} ${song.user_name}`;
    }

    // promo badge
    const promoBadgeText = $('#promoBadgeText');
    if (promoBadgeText) promoBadgeText.textContent = t('promoBadgeText');
  }

  return { t, getLang, setLang, applyAll };
})();

window.i18n = i18n;
