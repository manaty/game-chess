import {randomInt} from 'node:crypto';
import {legalMoves,pseudoMoves,applyMove,attacked} from './chess.js';

const values={P:100,N:320,B:330,R:500,Q:900,K:0};
const square=i=>'abcdefgh'[i&7]+(8-(i>>3));
const priority=move=>(values[move.capture?.toUpperCase()]||0)*10-(values[move.piece.toUpperCase()]||0)+(move.promotion?values[move.promotion.toUpperCase()]:0)+(move.castle?40:0);
function evaluate(state,color){
 let result=0;
 state.board.forEach((piece,i)=>{
  if(!piece)return;
  const own=(piece===piece.toUpperCase()?'w':'b')===color;
  const center=7-Math.abs(3.5-(i&7))-Math.abs(3.5-(i>>3));
  const kind=piece.toUpperCase();
  result+=(own?1:-1)*(values[kind]+(kind==='N'||kind==='B'?center*5:kind==='P'?center*2:0));
 });
 return result;
}

// All chess information is public. The root move is chosen only from legal moves.
// Search is bounded by node count to stay inside the SDK's per-operation VM limit.
export function chooseChessAction(state,id,difficulty='medium',random=randomInt){
 if(state.reason||state.winner||state.players.find(p=>p.color===state.turn)?.id!==id)return null;
 const moves=legalMoves(state);if(!moves.length)return null;
 let selected;
 if(difficulty==='easy')selected=moves[random(moves.length)];
 else{
  const color=state.turn,ordered=[...moves].sort((a,b)=>priority(b)-priority(a));
  const repliesPerMove=Math.max(1,Math.floor(80/ordered.length)),deadline=Date.now()+12;let best=-Infinity;
  for(const move of ordered){
   if(difficulty==='hard'&&selected&&Date.now()>=deadline)break;
   const next=applyMove(state,move);let score=evaluate(next,color);
   if(difficulty==='hard'){
    const king=next.board.indexOf(next.turn==='w'?'K':'k');
    if(attacked(next.board,king,next.turn!=='w')&&!legalMoves(next).length)score=100000;
    else{
     // Search legal tactical replies, rather than expanding every quiet move.
     // This avoids hanging pieces while keeping decisions within the VM budget.
     const replies=pseudoMoves(next).filter(r=>r.capture||r.epCapture||r.promotion).sort((a,b)=>priority(b)-priority(a));
     let checked=0;
     for(const reply of replies){
      const response=applyMove(next,reply),theirKing=response.board.indexOf(next.turn==='w'?'K':'k');
      if(attacked(response.board,theirKing,next.turn!=='w'))continue;
      score=Math.min(score,evaluate(response,color));if(++checked>=repliesPerMove)break;
     }
    }
   }
   if(score>best){best=score;selected=move;}
  }
 }
 return {action:'move',value:{from:square(selected.from),to:square(selected.to),...(selected.promotion?{promotion:selected.promotion}:{})}};
}
