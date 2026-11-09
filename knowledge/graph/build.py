"""Generates graph.json and graph.mmd from the NODES/EDGES below. Run: python3 -I build.py"""
import json, pathlib

N = [  # id, type, label
 ("wag","artifact","Workload Authorization Grant"),
 ("platform","role","Platform"),("widp","role","Workload Identity Provider"),
 ("agent","role","Agent (workload)"),("as","role","Authorization Server"),("rs","role","Resource Server"),
 ("widp_reg","concept","WIdP registration"),("agent_id","concept","Agent Identifier (sub)"),
 ("access_token","artifact","Access token"),("token_request","concept","Token request (jwt-bearer)"),
 ("jwt_claims","concept","WAG JWT claims"),("typ","concept","typ = oauth-wag+jwt"),
 ("issuer_keys","concept","Issuer keys (JWKS)"),("tenancy","concept","Multi-tenancy / tenant claim"),
 ("permissions","concept","Permission policy"),("nickname","concept","nickname (display only)"),
 ("errors","concept","Error responses"),("as_metadata","concept","AS metadata advertisement"),
 ("rfc7523","spec","RFC 7523"),("rfc7521","spec","RFC 7521"),("rfc8707","spec","RFC 8707 resource"),
 ("rfc8414","spec","RFC 8414"),("rfc8725","spec","RFC 8725 JWT BCP"),("rfc8693","spec","RFC 8693"),
 ("idjag","spec","ID-JAG"),("rfc7591","spec","RFC 7591"),
 ("oi_pop","open_issue","Proof of possession"),("oi_replay","open_issue","jti replay"),
 ("oi_ownership","open_issue","Agent ownership (#13)"),("oi_client","open_issue","Agent as subject vs client (O4)"),
 ("dpop","spec","DPoP (RFC 9449)"),("attest","spec","Attestation-based client auth"),
 ("cimd","spec","CIMD + private_key_jwt"),
 ("d3","decision","D3 RFC 7523 grant"),("d4","decision","D4 client identity unspecified"),
 ("d8","decision","D8 multi-issuer scoping"),("d11","decision","D11 OBO out of scope"),
 ("d16","decision","D16 explicit typing"),("d17","decision","D17 grant-profile discovery"),
 ("obo","concept","On-behalf-of (out of scope)"),
 ("playground","project","WAG developer playground"),
]
E = [  # src, relation, dst
 ("platform","hosts","agent"),("platform","operates","widp"),("widp","issues","wag"),
 ("wag","names","agent_id"),("agent_id","identifies","agent"),("agent","presents","wag"),
 ("wag","presented_in","token_request"),("token_request","sent_to","as"),("as","issues","access_token"),
 ("access_token","used_at","rs"),("as","holds","widp_reg"),("widp_reg","trusts","widp"),
 ("widp_reg","records","issuer_keys"),("widp_reg","may_record","tenancy"),("widp_reg","defines","permissions"),
 ("wag","has_claims","jwt_claims"),("jwt_claims","includes","agent_id"),("jwt_claims","includes","nickname"),
 ("wag","typed_by","typ"),("typ","motivated_by","rfc8725"),("as","verifies_with","issuer_keys"),
 ("as","keys_records_on","agent_id"),("permissions","must_not_use","nickname"),
 ("as","returns","errors"),("as","publishes","as_metadata"),("as_metadata","uses","idjag"),("as_metadata","uses","rfc8414"),
 ("token_request","based_on","rfc7523"),("rfc7523","based_on","rfc7521"),("token_request","carries","rfc8707"),
 ("widp_reg","is_not","rfc7591"),("wag","may_issue_via","rfc8693"),("tenancy","recommends","idjag"),
 ("wag","excludes","obo"),("obo","would_use","rfc8693"),("obo","would_use","idjag"),
 ("d3","shapes","token_request"),("d4","shapes","token_request"),("d8","shapes","widp_reg"),
 ("d11","scopes","obo"),("d16","shapes","typ"),("d17","shapes","as_metadata"),
 ("oi_pop","affects","wag"),("oi_pop","candidate","dpop"),("oi_pop","candidate","attest"),("oi_pop","candidate","cimd"),
 ("oi_replay","affects","as"),("oi_ownership","affects","agent"),("oi_client","affects","token_request"),
 ("oi_client","tied_to","d4"),("playground","tests","wag"),("playground","simulates","as"),("playground","simulates","widp"),
]
ids = {i for i,_,_ in N}
assert len(ids)==len(N) and all(a in ids and b in ids for a,_,b in E), "dangling edge or duplicate id"
d = pathlib.Path(__file__).parent
(d/"graph.json").write_text(json.dumps({"source":"../SOURCE.md",
  "nodes":[{"id":i,"type":t,"label":l} for i,t,l in N],
  "edges":[{"from":a,"rel":r,"to":b} for a,r,b in E]}, indent=1)+"\n")
m=["graph LR"]+[f'  {i}["{l}"]' for i,_,l in N]+[f'  {a} -->|{r}| {b}' for a,r,b in E]
(d/"graph.mmd").write_text("\n".join(m)+"\n")
print(len(N),"nodes",len(E),"edges")
