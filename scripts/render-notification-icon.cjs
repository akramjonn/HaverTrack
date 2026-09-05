// Compile the monochrome plate/utensils mark to Android's transparent PNG asset.
const { PNG } = require('pngjs');
const fs = require('node:fs');
const path = require('node:path');
const png = new PNG({ width: 96, height: 96 });
function ink(x,y) {
  const r=Math.hypot(x-49,y-49);
  const plate=r>=20&&r<=26;
  const fork=(Math.abs(x-12)<3&&y>19&&y<78)||([6,12,18].some(t=>Math.abs(x-t)<1.6)&&y>17&&y<37)||(x>6&&x<18&&y>33&&y<38);
  const knife=(x>82&&x<87&&y>17&&y<78)||(x>77&&x<86&&y>17&&y<48);
  return plate||fork||knife;
}
for(let y=0;y<96;y++)for(let x=0;x<96;x++){
  let coverage=0;for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++)if(ink(x+(sx+.5)/4,y+(sy+.5)/4))coverage++;
  const offset=(y*96+x)*4;png.data[offset]=png.data[offset+1]=png.data[offset+2]=255;png.data[offset+3]=Math.round(255*coverage/16);
}
fs.writeFileSync(path.join(__dirname,'../assets/images/notification-icon.png'),PNG.sync.write(png));
console.log('Compiled notification-icon.png (96×96, white on transparent).');
