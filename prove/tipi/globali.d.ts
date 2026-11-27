// Nomi globali che l'app trova nel browser (librerie in vendor/ caricate da index.html, app Android, dettatura):
// dichiarati qui solo per il controllo dei tipi (prove/tipi.test.mjs), così non compaiono come errori.
interface Window {
  supabase: any;
  Capacitor: any;
  SpeechRecognition: any;
  webkitSpeechRecognition: any;
}
