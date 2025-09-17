// frontend/script.js (Versión Definitiva con Prompts Dinámicos)
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input'),
          chatBody = document.getElementById('chat-body'),
          tutorModeBtn = document.getElementById('tutor-mode-btn'),
          bubbleIcon = document.getElementById('bubble-icon-img'),
          sendBtn = document.getElementById('send-btn'),
          closeChat = document.getElementById('close-chat'),
          chatBubble = document.getElementById('chat-bubble');

    //const API_URL = 'http://127.0.0.1:8000/chat';
    const API_URL = 'https://cundibotapi-chat.onrender.com/chat';
    let chatHistory = [], isTutorMode = false;
    let tutorState = { phase: 'idle', topic: '', currentIndex: 0 };
    const conversationId = crypto.randomUUID();


    // --- Listeners Principales ---
    chatBubble.addEventListener('click', () => document.body.classList.add('chat-is-open'));
    closeChat.addEventListener('click', () => document.body.classList.remove('chat-is-open'));
    sendBtn.addEventListener('click', handleUserInput);
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUserInput(); });
    tutorModeBtn.addEventListener('click', toggleTutorMode);

    function toggleTutorMode() {
        isTutorMode = !isTutorMode;
        document.body.classList.toggle('tutor-mode-active');
        clearChat();

        if (isTutorMode) {
            bubbleIcon.src = 'icons/tutor-icon.png';
            tutorState.phase = 'waiting_topic';
            appendMessage('¡Modo Tutor activado! 🧠 Soy tu entrenador personal. Dime, ¿sobre qué tema de la universidad quieres practicar hoy?', 'bot');
        } else {
            bubbleIcon.src = 'icons/bubble-icon.svg';
            resetTutorState();
            appendMessage('Saliste del Modo Tutor. Vuelvo a ser tu asistente general.', 'bot');
        }
    }
    
    async function handleUserInput() {
        const userInput = chatInput.value.trim();
        if (!userInput) return;
        appendMessage(userInput, 'user');
        chatInput.value = '';
        setTyping(true);

        let questionToSend = '';
        const currentMode = isTutorMode ? 'tutor' : 'normal';

        if (!isTutorMode) {
            questionToSend = `(MODO: Normal) Por favor, responde la siguiente pregunta de forma natural y servicial, como CundiBot.\n\nPregunta: ${userInput}`;
        } else {
            // Lógica de prompts dinámicos para el tutor
            switch (tutorState.phase) {
                case 'waiting_topic':
                    tutorState.topic = userInput;
                    questionToSend = `(MODO: Tutor - Fase 1) El estudiante quiere estudiar sobre '${userInput}'. 

                    ACTÚAS COMO UN TUTOR EXPERTO. Tu personalidad ahora es más informal, objetiva, motivadora y pedagógica y puedes jugar un poco con el ususario con bromas y burlas.
                    Tu misión es ayudar al estudiante a aprender sobre el tema que él elija.
                    puedes revisar en tu base de conocimiento si crees necesario para enfocarte en la pedagogía de la universidad que es el MEDIT                    
                    Este es el flujo que debes seguir:
                    1.  Cuando el usuario te dé un tema, confirma que lo has entendido y dile que le harás 3 preguntas. Luego, haz la primera pregunta INMEDIATAMENTE.
                    2.  Espera la respuesta del estudiante a la pregunta.
                    3.  INMEDIATAMENTE, Cuando responda, dile si es correcta o no, dale una retroalimentación breve y útil, enfocándote en puntos de mejora.
                    4.  INMEDIATAMENTE Después de la retroalimentación, y en otra conversación, haz la siguiente pregunta.
                    5.  Repite el paso 3 y 4 hasta completar las 3 preguntas.
                    6.  Después de la retroalimentación de la última pregunta, en un NUEVO mensaje separado, dale una calificación de 0 a 5 y bromea y pregúntale si quiere seguir con el mismo tema o elegir uno nuevo.
                    Mantén siempre este rol de tutor interactivo, objetivo, bromista, hasta que el usuario decida salir de este modo.
                    # importante 
                    * debes seguir el flujo hasta que el usuario decida cambiar de modo. 
                    * Siempre que el ususario responda debes contestar inicialmente diciendo si acertó, si estuvo cerca o estuvo mal
                    * no tengas miedo en decir que está mal la respuesta si así lo crees, eso es lo que quiere el usuario. 
                    * Solo son tres preguntas, debes pensar que eres el tutor, el usuario te pregunta y tu contestas. 
                    * Todo lo que el usuario escriba es considerado una respuesta... 

                                        
                    dile "listo, vamos a estudiar sobre ${userInput}" y hazle SOLAMENTE la primera pregunta.`;
                    tutorState.phase = 'waiting_answer_1';
                    break;
                case 'waiting_answer_1':
                case 'waiting_answer_2':
                case 'waiting_answer_3':
                    const questionIndex = tutorState.currentIndex;
                    questionToSend = `(MODO: Tutor - Fase 2) Estás en medio de un quiz sobre '${tutorState.topic}'. El estudiante está respondiendo la pregunta número ${questionIndex + 1}. Su respuesta es: "${userInput}".\n\nTu tarea es: \n1. Dar una retroalimentación breve, informal y útil sobre su respuesta.\n2. Si no es la última pregunta, INMEDIATAMENTE después de la retroalimentación, haz la siguiente pregunta del quiz.`;
                    tutorState.phase = `waiting_answer_${questionIndex + 2}`;
                    tutorState.currentIndex++;
                    break;
            }
        }
        
        const data = await postData(API_URL, { 
            full_prompt: questionToSend,  // El prompt completo para la IA
            raw_question: userInput,      // La pregunta limpia para guardar en el log
            chat_history: chatHistory,
            mode: currentMode,
            conversation_id: conversationId // El nuevo ID de la conversación
         });
        setTyping(false);

        if (data && data.answer) {
            appendMessage(data.answer, 'bot');
            chatHistory.push([questionToSend, data.answer]); // Guardamos el prompt completo en el historial

            // Lógica para la calificación final del tutor
            if (isTutorMode && tutorState.currentIndex === 3) {
                 setTyping(true);
                 const finalPrompt = `(MODO: Tutor - Fase 3) El quiz sobre '${tutorState.topic}' ha terminado. Ahora, en un nuevo mensaje, dale al estudiante una calificación conceptual general (sin decirle el número de aciertos, solo una frase motivadora) y pregúntale si quiere seguir estudiando el mismo tema o elegir uno nuevo.`;
                 const finalData = await postData(API_URL, { question: finalPrompt, chat_history: chatHistory });
                 setTyping(false);
                 if(finalData && finalData.answer) {
                     appendMessage(finalData.answer, 'bot');
                     chatHistory.push([finalPrompt, finalData.answer]);
                 }
                 resetTutorState();
                 tutorState.phase = 'waiting_topic';
            }
        }
    }
    
    function resetTutorState() {
        tutorState = { phase: 'idle', topic: '', quiz: [], currentIndex: 0, score: 0 };
    }

    // --- Funciones Auxiliares (sin cambios) ---
    function clearChat() { chatBody.innerHTML = ''; chatHistory = []; }
    async function postData(url, body) {
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) { const errorData = await res.json(); throw new Error(errorData.detail || 'Error en la respuesta del servidor.'); }
            return await res.json();
        } catch (error) {
            handleError(error);
            return { error: error.message };
        }
    }
    function appendMessage(text, sender) { const div = document.createElement('div'); div.className = `chat-message ${sender}-message`; div.innerText = text; chatBody.appendChild(div); chatBody.scrollTop = chatBody.scrollHeight; }
    function setTyping(show) { let ind = document.getElementById('typing-indicator'); if (show && !ind) { const div = document.createElement('div'); div.className = 'chat-message bot-message'; div.id = 'typing-indicator'; div.innerText = '...'; chatBody.appendChild(div); chatBody.scrollTop = chatBody.scrollHeight; } else if (!show && ind) { ind.remove(); } }
    function handleError(error) { setTyping(false); appendMessage(`Lo siento, ocurrió un error: ${error.message}.`, 'bot'); console.error("Error:", error); }
});