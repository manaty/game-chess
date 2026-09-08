// Original vector silhouettes; no font or network asset is needed on a TV.
const SHAPES = {
 p: 'M25 26 C16 19 20 7 32 7 C44 7 48 19 39 26 L37 31 L41 46 L23 46 L27 31 Z',
 r: 'M19 10 L26 10 L26 17 L30 17 L30 10 L35 10 L35 17 L39 17 L39 10 L46 10 L46 24 L40 28 L42 46 L22 46 L24 28 L19 24 Z',
 n: 'M20 46 L22 37 L35 26 L27 27 L21 32 L15 27 L23 13 L32 9 L33 4 L41 10 C53 21 49 34 44 46 Z',
 b: 'M23 46 L27 32 C13 24 22 13 32 4 C42 13 51 24 37 32 L41 46 Z',
 q: 'M23 46 L21 29 L14 12 L25 23 L32 8 L39 23 L50 12 L43 29 L41 46 Z',
 k: 'M23 46 L26 31 C12 28 17 15 27 19 L29 17 L29 12 L23 12 L23 7 L29 7 L29 2 L35 2 L35 7 L41 7 L41 12 L35 12 L35 17 L37 19 C47 15 52 28 38 31 L41 46 Z',
};
const paths = new Map();
export function drawPiece(ctx, piece, x, y, size) {
 const kind=piece.toLowerCase(),white=piece!==kind;
 if(!paths.has(kind))paths.set(kind,new Path2D(SHAPES[kind]));
 ctx.save();ctx.translate(x,y);ctx.scale(size/64,size/64);
 ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(33,56,21,4,0,0,Math.PI*2);ctx.fill();
 const fill=ctx.createLinearGradient(15,0,49,0);
 fill.addColorStop(0,white?'#cbbf9e':'#101e26');fill.addColorStop(.38,white?'#fff8df':'#607783');fill.addColorStop(.68,white?'#eee2c1':'#334853');fill.addColorStop(1,white?'#b9ac89':'#0e1a21');
 ctx.fillStyle=fill;ctx.strokeStyle=white?'#645c48':'#91a3a9';ctx.lineWidth=1.4;ctx.lineJoin='round';
 ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=3;ctx.shadowOffsetY=2;
 ctx.fill(paths.get(kind));ctx.stroke(paths.get(kind));ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 for(const [bx,by,bw,bh] of [[21,44,22,5],[18,50,28,6]]){ctx.beginPath();ctx.rect(bx,by,bw,bh);ctx.fill();ctx.stroke();}
 ctx.strokeStyle=white?'#ffffffbb':'#a4bec9aa';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(22,51);ctx.lineTo(42,51);ctx.stroke();
 if(kind==='n'){ctx.fillStyle=white?'#263640':'#e8dcc0';ctx.beginPath();ctx.arc(31,18,1.6,0,7);ctx.fill();}
 if(kind==='b'){ctx.strokeStyle=white?'#827861':'#c4d0ce';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(34,13);ctx.lineTo(28,23);ctx.stroke();}
 ctx.restore();
}
