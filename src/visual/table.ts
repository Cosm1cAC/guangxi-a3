import type * as Three from 'three';

// Keep the native renderer compatible with scoped Three r108.
export function createTable(T: typeof Three, canvas: HTMLCanvasElement, width: number, height: number, pixelRatio = 1) {
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(pixelRatio,2));renderer.setSize(width,height,false);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,width/height,.1,100);
  camera.position.set(0,10.2,10.8);camera.lookAt(0,0,0);
  scene.add(new T.HemisphereLight(0xf0f5e7,0x17232e,1.8));
  const light=new T.DirectionalLight(0xffefc4,2.1);light.position.set(-4,10,6);scene.add(light);
  const materials=new Set<Three.Material>();
  function material(color:number){const m=new T.MeshStandardMaterial({color,roughness:.9});materials.add(m);return m;}
  const edge=material(0x131c23),wood=material(0x76583d),woodLight=material(0xa38158),felt=material(0x28664e),mark=material(0x9cbd8e),floor=material(0x28333d),grid=material(0x35424a),wall=material(0x202b34),card=material(0xf0f0dd),back=material(0x45697d),backEdge=material(0x8fa7ad);
  const table=new T.Group();scene.add(table);
  function box(w:number,h:number,d:number,x:number,y:number,z:number,m:Three.Material,parent:Three.Group|Three.Scene=table){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
  box(24,.2,23,0,-1.2,0,floor,scene);
  for(let i=-5;i<=5;i++){box(.025,.01,23,i*2,-1.09,0,grid,scene);box(24,.01,.025,0,-1.09,i*2,grid,scene);}
  box(24,5,.4,0,1,-8.5,wall,scene);
  box(9.6,.55,6.5,0,-.3,0,edge);box(9.4,.18,6.3,0,0,0,wood);box(8.7,.05,5.55,0,.12,0,felt);
  box(9.1,.06,.1,0,.14,-3,woodLight);box(9.1,.06,.1,0,.14,3,woodLight);
  box(.1,.06,5.9,-4.5,.14,0,woodLight);box(.1,.06,5.9,4.5,.14,0,woodLight);
  for(const x of [-4.45,4.45])for(const z of [-2.95,2.95])box(.28,.1,.28,x,.15,z,edge);
  for(let i=-6;i<=6;i++){box(.1,.01,.035,i*.55,.151,-2.5,mark);box(.1,.01,.035,i*.55,.151,2.5,mark);}
  const spade=['00011000','00111100','01111110','11111111','11111111','01111110','00011000','00111100'];
  spade.forEach((row,z)=>[...row].forEach((v,x)=>{if(v==='1')box(.13,.012,.13,(x-3.5)*.14,.152,(z-3.5)*.14,mark);}));
  const pile=new T.Group();pile.position.set(0,.2,.4);table.add(pile);
  function setPile(count:number){
    while(pile.children.length){const mesh=pile.children[0] as Three.Mesh;pile.remove(mesh);mesh.geometry.dispose();}
    for(let i=0;i<count;i++)box(.5,.02,.74,(i-(count-1)/2)*.25,i*.006,0,card,pile);
  }
  for(let seat=0;seat<3;seat++){
    const hand=new T.Group();hand.position.set(seat===0?3.4:seat===2?-3.4:0,.2,seat===1?-1.9:0);hand.rotation.y=seat===1?0:Math.PI/2;
    for(let i=0;i<7;i++){const x=(i-3)*.15,y=i*.008;box(.4,.025,.64,x,y,0,backEdge,hand);box(.32,.008,.54,x,y+.018,0,back,hand);}table.add(hand);
  }
  return {renderer,scene,camera,setPile,
    render(_time=0){renderer.render(scene,camera);},
    resize(w:number,h:number){camera.aspect=w/h;camera.fov=w/h>2?24:38;camera.position.z=w/h<1?18:10.8;camera.updateProjectionMatrix();renderer.setSize(w,h,false);},
    dispose(){scene.traverse(o=>{const mesh=o as Three.Mesh;if(mesh.geometry)mesh.geometry.dispose();});materials.forEach(m=>m.dispose());renderer.dispose();}
  };
}
