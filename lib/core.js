/* FakeLC.lol - wspólny rdzeń logiki. Działa w Node (server.js) i w przeglądarce (index.html). */
(function (root) {
  'use strict';
  function make(cfg) {
    const BUY = cfg.BUY, PAY = cfg.PAY, MIN = cfg.MIN_PAYOUT, DISCORD = cfg.DISCORD;
    const bad = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
    const cl = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
    const LTC = /^(ltc1[a-z0-9]{38,87}|[LM][a-km-zA-HJ-NP-Z1-9]{26,34}|3[a-km-zA-HJ-NP-Z1-9]{26,34})$/;
    const INVITE = /^https:\/\/(www\.)?(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[A-Za-z0-9_-]{2,40}\/?$/i;
    const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
    const MAX_IMG = 1800000;
    const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    const pubUser = (u) => u && { id: u.id, email: u.email, discord: u.discord, role: u.role };

    function validateRegister(b) {
      const email = cl(b.email, 120).toLowerCase(), pass = String(b.password || ''), discord = cl(b.discord, 40);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw bad(400, 'Podaj poprawny e-mail.');
      if (pass.length < 6 || pass.length > 100) throw bad(400, 'Hasło musi mieć co najmniej 6 znaków.');
      if (discord.length < 2) throw bad(400, 'Podaj swój nick na Discordzie.');
      return { email, pass, discord };
    }

    // ----- widoki ofert: każdy widzi tylko swoją stawkę -----
    const pubOffer = (o) => ({ id: o.id, amount: o.amount, reward: o.amount * PAY, note: o.note, createdAt: o.createdAt });
    const creatorOffer = (o) => ({ id: o.id, code: o.code, amount: o.amount, price: o.amount * BUY, link: o.link, note: o.note, status: o.status, createdAt: o.createdAt, msg: o.msg || '' });
    const workerOffer = (o) => ({ id: o.id, amount: o.amount, reward: o.amount * PAY, link: o.link, note: o.note, status: o.status, takenAt: o.takenAt, msg: o.review || '', proofNick: o.proof ? o.proof.nick : '', proofAt: o.proof ? o.proof.at : 0 });

    function handle(db, me, method, path, body, h) {
      body = body || {};
      const now = Date.now();
      const U = (id) => db.users.find((u) => u.id === id);
      const needU = () => { if (!me) throw bad(401, 'Zaloguj się.'); };
      const needO = () => { needU(); if (me.role !== 'owner') throw bad(403, 'Brak dostępu.'); };
      const earned = (uid) => db.offers.filter((o) => o.workerId === uid && o.status === 'done').reduce((s, o) => s + o.amount * PAY, 0);
      const reserved = (uid) => db.withdrawals.filter((w) => w.userId === uid && w.status !== 'rejected').reduce((s, w) => s + w.amount, 0);
      const wallet = (uid) => {
        const e = earned(uid), r = reserved(uid);
        const paid = db.withdrawals.filter((w) => w.userId === uid && w.status === 'paid').reduce((s, w) => s + w.amount, 0);
        const pending = db.withdrawals.filter((w) => w.userId === uid && w.status === 'pending').reduce((s, w) => s + w.amount, 0);
        return { earned: e, paid, pending, available: e - r };
      };
      const newCode = (prefix) => {
        let c;
        do { c = prefix + '-' + Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(h.random() * CODE_CHARS.length)]).join(''); } while (db.offers.some((o) => o.code === c));
        return c;
      };
      let m;

      if (path === '/api/config') return { buyPrice: BUY, payout: PAY, discord: DISCORD, minPayout: MIN };
      if (path === '/api/announcements' && method === 'GET') return { announcements: db.announcements.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5) };

      // --- lista ofert (dla osób wystawiających LC na serwerach) ---
      if (path === '/api/offers' && method === 'GET') {
        return { offers: db.offers.filter((o) => o.status === 'live').sort((a, b) => b.createdAt - a.createdAt).map(pubOffer) };
      }
      // --- nowa oferta: link do serwera Discord + ilość LC ---
      if (path === '/api/offers' && method === 'POST') {
        needU();
        const amount = Math.floor(Number(body.amount));
        if (!(amount >= 1 && amount <= 100000)) throw bad(400, 'Podaj ilość LC (1 - 100000).');
        let link = cl(body.link, 120);
        if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
        link = link.replace(/^http:\/\//i, 'https://');
        if (!INVITE.test(link)) throw bad(400, 'Podaj link zaproszenia do serwera Discord, np. https://discord.gg/abc123');
        const mine = db.offers.filter((o) => o.creatorId === me.id && o.status === 'pending').length;
        if (me.role !== 'owner' && mine >= 10) throw bad(429, 'Masz już 10 ofert czekających na akceptację.');
        const o = { id: h.rid(), code: newCode('OF'), creatorId: me.id, workerId: null, amount, link, note: cl(body.note, 140), status: me.role === 'owner' ? 'live' : 'pending', createdAt: now };
        db.offers.push(o);
        return { offer: creatorOffer(o), discord: DISCORD };
      }
      if (path === '/api/my/offers' && method === 'GET') {
        needU();
        return { offers: db.offers.filter((o) => o.creatorId === me.id).sort((a, b) => b.createdAt - a.createdAt).map(creatorOffer), discord: DISCORD };
      }
      if ((m = path.match(/^\/api\/my\/offers\/(\w+)$/)) && method === 'DELETE') {
        needU();
        const i = db.offers.findIndex((o) => o.id === m[1] && o.creatorId === me.id);
        if (i < 0) throw bad(404, 'Nie znaleziono oferty.');
        if (!['pending', 'live', 'rejected'].includes(db.offers[i].status)) throw bad(409, 'Tej oferty nie można już wycofać.');
        db.offers.splice(i, 1);
        return { ok: true };
      }

      // --- praca: wzięcie oferty, dowód ---
      if ((m = path.match(/^\/api\/offers\/(\w+)\/take$/)) && method === 'POST') {
        needU();
        const o = db.offers.find((x) => x.id === m[1]);
        if (!o || o.status !== 'live') throw bad(409, 'Ta oferta jest już niedostępna.');
        if (o.creatorId === me.id) throw bad(400, 'Nie możesz wziąć własnej oferty.');
        const active = db.offers.filter((x) => x.workerId === me.id && ['taken', 'review'].includes(x.status)).length;
        if (me.role !== 'owner' && active >= 3) throw bad(429, 'Możesz mieć naraz 3 aktywne zlecenia.');
        o.status = 'taken'; o.workerId = me.id; o.takenAt = now; o.review = '';
        return { offer: workerOffer(o) };
      }
      if ((m = path.match(/^\/api\/offers\/(\w+)\/release$/)) && method === 'POST') {
        needU();
        const o = db.offers.find((x) => x.id === m[1] && x.workerId === me.id);
        if (!o || o.status !== 'taken') throw bad(409, 'Tego zlecenia nie można oddać.');
        o.status = 'live'; o.workerId = null; o.proof = null; o.review = '';
        return { ok: true };
      }
      if ((m = path.match(/^\/api\/offers\/(\w+)\/proof$/)) && method === 'POST') {
        needU();
        const o = db.offers.find((x) => x.id === m[1] && x.workerId === me.id);
        if (!o || o.status !== 'taken') throw bad(409, 'Do tego zlecenia nie można teraz dodać dowodu.');
        const nick = cl(body.nick, 40), image = String(body.image || '');
        if (nick.length < 2) throw bad(400, 'Podaj swój nick z Discorda widoczny na zrzucie.');
        if (!IMG.test(image) || image.length > MAX_IMG) throw bad(400, 'Dodaj zrzut ekranu (JPG, PNG lub WebP, do ok. 1,3 MB).');
        o.proof = { nick, image, at: now }; o.status = 'review'; o.review = '';
        return { ok: true };
      }
      if (path === '/api/my/work' && method === 'GET') {
        needU();
        return { offers: db.offers.filter((o) => o.workerId === me.id).sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0)).map(workerOffer), wallet: wallet(me.id) };
      }

      // --- portfel i wypłaty (tylko LTC, min 2 zł) ---
      if (path === '/api/my/wallet' && method === 'GET') {
        needU();
        return { wallet: wallet(me.id), min: MIN, withdrawals: db.withdrawals.filter((w) => w.userId === me.id).sort((a, b) => b.createdAt - a.createdAt) };
      }
      if (path === '/api/withdrawals' && method === 'POST') {
        needU();
        const amount = Math.round(Number(body.amount) * 100) / 100;
        const address = cl(body.address, 120).replace(/\s+/g, '');
        if (!LTC.test(address)) throw bad(400, 'Podaj poprawny adres LTC (Litecoin).');
        if (!(amount >= MIN)) throw bad(400, 'Minimalna wypłata to ' + MIN + ' zł.');
        if (amount > wallet(me.id).available + 0.001) throw bad(400, 'Nie masz tyle środków na saldzie.');
        const w = { id: h.rid(), userId: me.id, amount, address, status: 'pending', createdAt: now };
        db.withdrawals.push(w);
        return { withdrawal: w };
      }

      // --- panel właściciela ---
      if (path === '/api/admin/overview' && method === 'GET') {
        needO();
        const who = (id) => { const u = U(id); return u ? { email: u.email, discord: u.discord } : { email: '?', discord: '' }; };
        const done = db.offers.filter((o) => o.status === 'done');
        let revenue = 0, credited = 0;
        done.forEach((o) => {
          const c = U(o.creatorId), w = U(o.workerId);
          if (c && c.role !== 'owner') revenue += o.amount * BUY;
          if (w && w.role !== 'owner') credited += o.amount * PAY;
        });
        const paidOut = db.withdrawals.filter((w) => w.status === 'paid').reduce((s, w) => s + w.amount, 0);
        const pendingW = db.withdrawals.filter((w) => w.status === 'pending');
        const row = (o) => Object.assign({}, creatorOffer(o), { creator: who(o.creatorId), worker: o.workerId ? who(o.workerId) : null, reward: o.amount * PAY, proofNick: o.proof ? o.proof.nick : '', proofAt: o.proof ? o.proof.at : 0 });
        return {
          stats: { revenue, credited, profit: revenue - credited, paidOut, toPay: pendingW.reduce((s, w) => s + w.amount, 0), users: db.users.length, pending: db.offers.filter((o) => o.status === 'pending').length, review: db.offers.filter((o) => o.status === 'review').length, withdrawals: pendingW.length, liveLc: db.offers.filter((o) => o.status === 'live').reduce((s, o) => s + o.amount, 0) },
          pending: db.offers.filter((o) => o.status === 'pending').sort((a, b) => a.createdAt - b.createdAt).map(row),
          review: db.offers.filter((o) => o.status === 'review').sort((a, b) => a.proof.at - b.proof.at).map(row),
          live: db.offers.filter((o) => ['live', 'taken'].includes(o.status)).sort((a, b) => b.createdAt - a.createdAt).map(row),
          withdrawals: db.withdrawals.slice().sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.createdAt - a.createdAt).slice(0, 200).map((w) => Object.assign({}, w, { user: who(w.userId) })),
        };
      }
      if ((m = path.match(/^\/api\/admin\/proof\/(\w+)$/)) && method === 'GET') {
        needO();
        const o = db.offers.find((x) => x.id === m[1]);
        if (!o || !o.proof) throw bad(404, 'Brak dowodu.');
        return { image: o.proof.image, nick: o.proof.nick, at: o.proof.at, link: o.link, amount: o.amount };
      }
      if ((m = path.match(/^\/api\/admin\/offers\/(\w+)\/(approve|reject|remove)$/)) && method === 'POST') {
        needO();
        const o = db.offers.find((x) => x.id === m[1]);
        if (!o) throw bad(404, 'Nie znaleziono oferty.');
        if (m[2] === 'remove') { if (!['live', 'taken'].includes(o.status)) throw bad(409, 'Można zdjąć tylko aktywną ofertę.'); o.status = 'rejected'; o.workerId = null; o.msg = 'Zdjęta przez właściciela'; }
        else {
          if (o.status !== 'pending') throw bad(409, 'Oferta nie czeka na akceptację.');
          o.status = m[2] === 'approve' ? 'live' : 'rejected';
          o.msg = m[2] === 'reject' ? (cl(body.msg, 140) || 'Odrzucona') : '';
        }
        return { ok: true };
      }
      if ((m = path.match(/^\/api\/admin\/offers\/(\w+)\/proof\/(accept|reject)$/)) && method === 'POST') {
        needO();
        const o = db.offers.find((x) => x.id === m[1]);
        if (!o || o.status !== 'review') throw bad(409, 'Ten dowód nie czeka na sprawdzenie.');
        if (m[2] === 'accept') { o.status = 'done'; o.doneAt = now; o.review = ''; }
        else { o.status = 'taken'; o.review = cl(body.msg, 140) || 'Dowód odrzucony, dodaj nowy zrzut.'; o.proof = null; }
        return { ok: true };
      }
      if ((m = path.match(/^\/api\/admin\/withdrawals\/(\w+)\/(paid|reject)$/)) && method === 'POST') {
        needO();
        const w = db.withdrawals.find((x) => x.id === m[1]);
        if (!w) throw bad(404, 'Nie znaleziono wypłaty.');
        if (w.status !== 'pending') throw bad(409, 'Ta wypłata jest już zamknięta.');
        w.status = m[2] === 'paid' ? 'paid' : 'rejected'; w.doneAt = now;
        return { ok: true };
      }
      if (path === '/api/admin/announcements' && method === 'POST') {
        needO();
        const text = cl(body.text, 280);
        if (text.length < 3) throw bad(400, 'Wpisz treść ogłoszenia.');
        db.announcements.push({ id: h.rid(), text, createdAt: now });
        return { ok: true };
      }
      if ((m = path.match(/^\/api\/admin\/announcements\/(\w+)$/)) && method === 'DELETE') {
        needO();
        db.announcements = db.announcements.filter((a) => a.id !== m[1]);
        return { ok: true };
      }
      throw bad(404, 'Nie znaleziono.');
    }

    return { handle, validateRegister, pubUser, bad, cl };
  }
  root.FakeCore = { make };
  if (typeof module !== 'undefined' && module.exports) module.exports = { make };
})(typeof window !== 'undefined' ? window : globalThis);
