let reps=0, running=false;
let deferredPrompt=null;

function speak(text){
  if(!localStorage.getItem('voiceOff')){
    const u = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(u);
  }
}

window.addEventListener('beforeinstallprompt',(e)=>{
  e.preventDefault();
  deferredPrompt=e;
});

function installApp(){
  if(deferredPrompt){
    deferredPrompt.prompt();
  }else{
    alert("Tap ⋮ then Add to Home Screen");
  }
}

function startSession(){
  document.getElementById('home').style.display='none';
  document.getElementById('session').style.display='block';
}

function goHome(){
  document.getElementById('home').style.display='block';
  document.getElementById('session').style.display='none';
}

function startSet(){
  reps=0;
  running=true;
  document.getElementById('reps').innerText=0;
  document.getElementById('phase').innerText="ANCHOR";
  speak("Start");
  window.addEventListener('devicemotion',detect);
}

function stopSet(){
  running=false;
  speak("Stop");
  window.removeEventListener('devicemotion',detect);
  setTimeout(()=>{
    document.getElementById('phase').innerText="REST";
    speak("Rest");
  },500);
}

let last="up", lastTime=0;

function detect(e){
  if(!running) return;
  let y=e.accelerationIncludingGravity?.y||0;
  if(y<-5 && last==="up") last="down";
  if(y>5 && last==="down"){
    let now=Date.now();
    if(now-lastTime>800){
      reps++;
      document.getElementById('reps').innerText=reps;
      lastTime=now;
    }
    last="up";
  }
}
