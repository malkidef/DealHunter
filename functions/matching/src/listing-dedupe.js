(function(root){
  function normalize(value){
    return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
      .replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
  }
  function similarity(a,b){
    const left=new Set(normalize(a).split(" ").filter(token=>token.length>1));
    const right=new Set(normalize(b).split(" ").filter(token=>token.length>1));
    if(!left.size||!right.size)return 0;
    const intersection=[...left].filter(token=>right.has(token)).length;
    return intersection/(left.size+right.size-intersection);
  }
  function findPotentialDuplicates(records,threshold=0.8){
    const items=Array.isArray(records)?records:[];
    const pairs=[];
    for(let i=0;i<items.length;i++){
      for(let j=i+1;j<items.length;j++){
        const a=items[i],b=items[j];
        if(!a||!b||!a.id||!b.id||a.id===b.id)continue;
        const sameCategory=normalize(a.category)===normalize(b.category);
        const geoA=normalize(a.countryCode||a.location),geoB=normalize(b.countryCode||b.location);
        const sameGeo=geoA&&geoB&&geoA===geoB;
        if(!sameCategory||!sameGeo)continue;
        const titleA=a.product||a.title||a.name||"",titleB=b.product||b.title||b.name||"";
        const score=similarity(titleA,titleB);
        if(score>=threshold){
          pairs.push({firstId:a.id,secondId:b.id,firstOwnerUid:a.ownerUid||null,secondOwnerUid:b.ownerUid||null,score:Number(score.toFixed(3)),reason:"Titre très proche, même catégorie et même pays"});
        }
      }
    }
    return pairs.sort((a,b)=>b.score-a.score);
  }
  const api={normalize,similarity,findPotentialDuplicates};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.DealHunterListingDedupe=api;
})(typeof globalThis!=="undefined"?globalThis:this);
