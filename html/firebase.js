import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/* CTO: Chaves de configuração do Firebase. É seguro mantê-las aqui. */
const firebaseConfig = {
    apiKey: "AIzaSyAuABk6sPhXG36JMd7HjZ_6NTnzRC5-D2M",
    authDomain: "atlas-ef533.firebaseapp.com",
    projectId: "atlas-ef533",
    storageBucket: "atlas-ef533.appspot.com",
    messagingSenderId: "508767351307",
    appId: "1:508767351307:web:be9907fb52d331ac764d0e",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };