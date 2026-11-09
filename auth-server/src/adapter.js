// node-oidc-provider persistence on top of the shared store, so issued artefacts survive restarts and span instances.
export function makeAdapter(store) {
  return class StoreAdapter {
    constructor(name) { this.name = name; }
    key(id) { return `oidc:${this.name}:${id}`; }
    async upsert(id, payload, expiresIn) {
      await store.set(this.key(id), payload, expiresIn);
      if (payload.grantId) await store.push(`oidc:grant:${payload.grantId}`, this.key(id), 200, expiresIn);
      if (payload.uid) await store.set(`oidc:${this.name}:uid:${payload.uid}`, id, expiresIn);
      if (payload.userCode) await store.set(`oidc:${this.name}:usercode:${payload.userCode}`, id, expiresIn);
    }
    async find(id) { return store.get(this.key(id)); }
    async findByUid(uid) { const id = await store.get(`oidc:${this.name}:uid:${uid}`); return id ? this.find(id) : undefined; }
    async findByUserCode(c) { const id = await store.get(`oidc:${this.name}:usercode:${c}`); return id ? this.find(id) : undefined; }
    async consume(id) { const p = await this.find(id); if (p) await store.set(this.key(id), { ...p, consumed: Math.floor(Date.now() / 1000) }, 3600); }
    async destroy(id) { await store.del(this.key(id)); }
    async revokeByGrantId(grantId) { for (const k of await store.list(`oidc:grant:${grantId}`)) await store.del(k); await store.del(`oidc:grant:${grantId}`); }
  };
}
