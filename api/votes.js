const COUNTRIES = new Set((
  "ir af al dz ad ao ag ar am au at az bs bh bd bb by be bz bj bt bo ba bw br bn bg bf bi cv kh cm ca cf td cl cn co km cg cd cr ci hr cu cy cz dk dj dm do ec eg sv gq er ee sz et fj fi fr ga gm ge de gh gr gd gt gn gw gy ht hn hu is in id iq ie it jm jp jo kz ke ki kp kr kw kg la lv lb ls lr ly li lt lu mg mw my mv ml mt mh mr mu mx fm md mc mn me ma mz mm na nr np nl nz ni ne ng mk no om pk pw pa pg py pe ph pl pt qa ro ru rw kn lc vc ws sm st sa sn rs sc sl sg sk si sb so za ss es lk sd sr se ch sy tj tz th tl tg to tt tn tr tm tv ug ua ae gb uz vu ve vn ye zm zw ps va"
).split(" "));

async function redis(cmd) {
  const r = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.UPSTASH_REDIS_REST_TOKEN },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function allVotes() {
  const arr = (await redis(["HGETALL", "votes"])) || [];
  const o = {};
  for (let i = 0; i < arr.length; i += 2) o[arr[i]] = parseInt(arr[i + 1], 10) || 0;
  return o;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") return res.status(200).json({ votes: await allVotes() });

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const id = String(body.id || "").toLowerCase();
      const voter = String(body.voter || "");
      const isMuslim = id === "muslim";
      if ((!isMuslim && !COUNTRIES.has(id)) || voter.length < 8 || voter.length > 100)
        return res.status(400).json({ error: "bad request" });

      const slot = isMuslim ? "muslim" : "country";
      const ok = await redis(["SET", `voted:${slot}:${voter}`, id, "NX", "EX", String(60 * 60 * 24 * 365)]);
      if (ok !== "OK") return res.status(409).json({ error: "already", votes: await allVotes() });

      await redis(["HINCRBY", "votes", id, "1"]);
      return res.status(200).json({ votes: await allVotes() });
    }
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: "server" });
  }
};
