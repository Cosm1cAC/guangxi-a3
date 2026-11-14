/** Display vocabulary only. Wire values, scoring and card-exchange rules stay shared. */
export function miniText(text:string):string {
  return text.replace(/进贡与还贡/g,'交牌与回牌')
    .replace(/进贡/g,'交牌').replace(/还贡/g,'回牌')
    .replace(/贡牌/g,'交出牌').replace(/大贡/g,'双张交牌').replace(/小贡/g,'单张交牌')
    .replace(/受贡者/g,'收牌者').replace(/农民方/g,'普通阵营')
    .replace(/A3方/g,'A3阵营').replace(/独食/g,'单人阵营')
    .replace(/接风/g,'接续领出');
}
