import {
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    deleteUser
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from './firebase.js';
import { DBService } from './database.js';

export const AuthService = {
    currentUser: null,
    async handleAuth() {
        return new Promise((resolve, reject) => { // Adicionado reject
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    try { // Adicionado try-catch para DBService.getUserProfile
                        const userProfile = await DBService.getUserProfile(user.uid);
                        this.currentUser = { ...user, ...(userProfile || {}) };
                        resolve(this.currentUser);
                    } catch (dbError) {
                        console.error("AuthService: Erro ao carregar perfil do usuário:", dbError);
                        this.currentUser = user; // Fallback para usar apenas o usuário do Firebase
                        resolve(this.currentUser); // Resolve, mas o erro é logado
                    }
                } else {
                    resolve(null);
                }
            }, (error) => { // Adicionado callback de erro para onAuthStateChanged
                console.error("AuthService: Erro no listener de autenticação:", error);
                reject(error); // Rejeita a promise se o onAuthStateChanged retornar um erro
            });
        });
    },
    async login(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    },
    async register(name, email, password) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: name });
        await DBService.createUserProfile(user.uid, { name, email, address: {} });
        return userCredential;
    },
    async logout() {
        await signOut(auth);
    },
    async updateUser(userData) {
        const user = auth.currentUser;
        if (user) {
            await updateProfile(user, { displayName: userData.name });
            await DBService.updateUserProfile(user.uid, userData);
            this.currentUser = { ...this.currentUser, ...userData };
        }
    }
};