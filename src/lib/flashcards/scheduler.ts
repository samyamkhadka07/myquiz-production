import { fsrs,createEmptyCard,type CardInput,type Grade } from 'ts-fsrs';
const scheduler=fsrs({request_retention:.9,enable_fuzz:false,maximum_interval:36500});
export function scheduleReview(state:Partial<CardInput>,rating:1|2|3|4,now:Date){
 const card={...createEmptyCard(now),...state};
 return scheduler.next(card,now,rating as Grade);
}
