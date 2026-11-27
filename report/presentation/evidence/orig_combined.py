import json, numpy as np
from eval.originality_eval import FX, tokens
from app.engines import originality as eng
ref=json.loads((FX/"ideas.reference.dev.json").read_text()); ev=json.loads((FX/"originality_eval.json").read_text())
emb=eng.get_embedder(); R=np.array(emb.encode([eng.idea_text(r["title"],r["description"]) for r in ref])); RT=[tokens(r["title"]+" "+r["description"]) for r in ref]
def q(t,d):
    v=np.array(emb.encode([eng.idea_text(t,d)])[0]); tk=tokens(t+" "+d)
    return float((R@v).max()), max(len(tk&rt)/max(len(tk|rt),1) for rt in RT)
P=[q(t,d) for _,t,d in ev["paraphrases"]+ev["hard_paraphrases"]]; N=[q(t,d) for t,d in ev["unrelated"]]
def prf(i,thr):
    tp=sum(p[i]>=thr for p in P); fn=len(P)-tp; fp=sum(n[i]>=thr for n in N); pr=tp/(tp+fp); rc=tp/len(P)
    return dict(thr=thr,tp=tp,fp=fp,fn=fn,precision=round(pr,3),recall=round(rc,3),f1=round(2*pr*rc/(pr+rc),3))
import numpy as np; t=float(np.arange(0.05,0.6,0.025)[2]); print(json.dumps({"n_pos":len(P),"n_neg":len(N),"minilm@0.45":prf(0,0.45),"keyword@0.10":prf(1,0.1),"keyword@arange_thr":prf(1,t),"arange_thr_repr":repr(t),"keyword_scores_exactly_0.1":sum(1 for p in P+N if abs(p[1]-0.1)<1e-12)},indent=1))
