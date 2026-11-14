import type * as Three from 'three';

// Inject the renderer namespace: current Three.js on web, scoped r108 on WeChat.
export function createTable(T: typeof Three, canvas: HTMLCanvasElement, width: number, height: number, pixelRatio = 1) {
  const renderer = new T.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(pixelRatio, 2));
  renderer.setSize(width,height,false);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(38,width/height,.1,100);
  camera.position.set(0,10.2,10.8); camera.lookAt(0,0,0);
  scene.add(new T.HemisphereLight(0xe9fff4,0x263b43,2));
  const light=new T.DirectionalLight(0xffe4b0,2.4);light.position.set(-4,10,6);scene.add(light);
  const group=new T.Group();scene.add(group);
  const mat=(color:number,metalness=0,roughness=.7)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const brass=mat(0xb9975b,.65,.35), wood=mat(0x203d40), felt=mat(0x397469), ink=mat(0x234f4e);
  function cylinder(radius:number,depth:number,y:number,material:Three.Material,segments=64){
    const m=new T.Mesh(new T.CylinderGeometry(radius,radius,depth,segments),material);m.scale.z=.70;m.position.y=y;group.add(m);return m;
  }
  cylinder(4.55,.45,-.30,wood,64);cylinder(4.49,.10,-.04,brass);cylinder(4.35,.10,.03,wood);cylinder(4.13,.04,.10,felt);
  function ring(radius:number,tube:number,y:number,material:Three.Material){const m=new T.Mesh(new T.TorusGeometry(radius,tube,8,96),material);m.rotation.x=-Math.PI/2;m.scale.y=.7;m.position.y=y;group.add(m);}
  ring(3.97,.014,.134,brass);ring(1.02,.012,.14,brass);ring(.93,.008,.14,brass);
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;
    const shape=new T.Shape();shape.moveTo(0,.72);shape.lineTo(-.07,.36);shape.lineTo(0,.45);shape.lineTo(.07,.36);shape.closePath();
    const ray=new T.Mesh(new T.ShapeGeometry(shape),brass);ray.rotation.x=-Math.PI/2;ray.rotation.z=a;ray.position.y=.145;group.add(ray);
  }
  for(let i=0;i<40;i++){
    const a=i*Math.PI/20;const m=new T.Mesh(new T.BoxGeometry(.07,.015,.07),brass);m.position.set(Math.cos(a)*3.85,.14,Math.sin(a)*2.70);m.rotation.y=-a;group.add(m);
  }
  // A small celadon tea cup and saucer, modeled entirely in code.
  const ceramic=mat(0xb4d5c0,.12,.28);
  const saucer=new T.Mesh(new T.CylinderGeometry(.25,.22,.045,32),ceramic);saucer.position.set(3.4,.18,.8);group.add(saucer);
  const cup=new T.Mesh(new T.CylinderGeometry(.14,.10,.20,32),ceramic);cup.position.set(3.4,.29,.8);group.add(cup);
  const tea=new T.Mesh(new T.CircleGeometry(.117,32),mat(0x685632));tea.rotation.x=-Math.PI/2;tea.position.set(3.4,.395,.8);group.add(tea);
  const pile=new T.Group();pile.position.set(0,.18,.35);group.add(pile);
  const cardMat=mat(0xf6f3e6), backMat=mat(0x376578);
  function setPile(count:number){
    while(pile.children.length){const c=pile.children.pop() as Three.Mesh;c.geometry.dispose();}
    for(let i=0;i<count;i++){const m=new T.Mesh(new T.BoxGeometry(.58,.018,.83),cardMat);m.position.set((i-(count-1)/2)*.65,.02*i,0);m.rotation.y=(i-(count-1)/2)*.04;pile.add(m);}
  }
  const backs:Three.Group[]=[];
  for(let seat=0;seat<3;seat++){
    const g=new T.Group();g.position.set(seat===0?3.1:seat===2?-3.1:0,.18,seat===1?-2:0);g.rotation.y=seat===1?0:Math.PI/2;
    for(let i=0;i<7;i++){const m=new T.Mesh(new T.BoxGeometry(.42,.025,.65),backMat);m.position.set((i-3)*.10,i*.012,0);g.add(m);}group.add(g);backs.push(g);
  }
  // Faceted limestone silhouettes occupy the horizon outside the playable table.
  for(let i=0;i<11;i++){const h=1.2+Math.sin(i*2.3)**2*2.5;const m=new T.Mesh(new T.ConeGeometry(.8,h,5),ink);m.position.set((i-5)*1.6,-.6,-5.8-Math.cos(i)*.4);scene.add(m);}
  let frame=0;
  return {renderer,scene,camera,setPile,
    render(time=0){group.rotation.y=Math.sin(time*.00015)*.008;renderer.render(scene,camera);frame++;},
    resize(w:number,h:number){camera.aspect=w/h;camera.fov=w/h>2?24:38;camera.position.z=w/h<1?18:10.8;camera.updateProjectionMatrix();renderer.setSize(w,h,false);},
    dispose(){scene.traverse(o=>{const m=o as Three.Mesh;if(m.geometry)m.geometry.dispose();});[brass,wood,felt,ink,ceramic,tea.material,cardMat,backMat].forEach(m=>m.dispose());renderer.dispose();}
  };
}
