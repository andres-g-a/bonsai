window.MOCK_SESSION = {
  objective: "Aprender la instrucción MOV en assembler",

  tags: {
    "mov-instruction":   { color: "#7aa2f7", label: "MOV" },
    "assembly-syntax":   { color: "#9ece6a", label: "Sintaxis" },
    "registers":         { color: "#bb9af7", label: "Registros" },
    "cpu-architectures": { color: "#e0af68", label: "Arquitecturas" },
    "risc-vs-cisc":      { color: "#f7768e", label: "RISC vs CISC" }
  },

  nodes: [
    {
      id: "n1",
      parent_id: null,
      tag: "mov-instruction",
      branch: "main",
      is_main_path: true,
      relevance: 1.0,
      content_user: "¿Qué hace la instrucción MOV en x86?",
      content_assistant: "MOV copia un valor desde un origen a un destino. La forma general es MOV destino, origen. El origen puede ser un registro, un valor inmediato, o una posición de memoria; el destino puede ser un registro o memoria, pero no ambos a la vez."
    },
    {
      id: "n2",
      parent_id: "n1",
      tag: "assembly-syntax",
      branch: "main",
      is_main_path: true,
      relevance: 0.95,
      content_user: "¿Qué diferencia hay entre la sintaxis Intel y AT&T para MOV?",
      content_assistant: "En Intel: MOV eax, ebx → copia ebx a eax (destino primero). En AT&T: movl %ebx, %eax → copia ebx a eax (origen primero, sufijo de tamaño y prefijo % en registros). GCC usa AT&T por default; NASM usa Intel."
    },
    {
      id: "n3",
      parent_id: "n2",
      tag: "cpu-architectures",
      branch: "arm",
      is_main_path: false,
      relevance: 0.25,
      content_user: "Mencionaste que esto difiere en ARM, ¿en qué sentido?",
      content_assistant: "En ARM no existe una instrucción MOV genérica que mueva entre memoria y registros. ARM usa una arquitectura load/store: LDR para cargar de memoria a registro, STR para guardar de registro a memoria, y MOV solo entre registros o con valores inmediatos limitados."
    },
    {
      id: "n4",
      parent_id: "n3",
      tag: "risc-vs-cisc",
      branch: "risc",
      is_main_path: false,
      relevance: 0.10,
      content_user: "¿Por qué ARM no permite MOV directo a memoria como x86?",
      content_assistant: "Porque ARM es RISC: cada instrucción debe ejecutarse en un ciclo y tener un propósito atómico. Permitir MOV memoria-memoria requeriría dos accesos a memoria por instrucción, rompiendo el principio. x86 es CISC y favorece instrucciones más expresivas a costa de complejidad."
    },
    {
      id: "n5",
      parent_id: "n4",
      tag: "risc-vs-cisc",
      branch: "risc",
      is_main_path: false,
      relevance: 0.08,
      content_user: "¿Qué ventajas prácticas tiene RISC entonces?",
      content_assistant: "Pipeline más simple, menor consumo, mejor predicción de saltos, y compiladores que pueden optimizar mejor con un set de instrucciones uniforme. Es la razón por la que ARM domina mobile y está creciendo en servidores (Apple Silicon, AWS Graviton)."
    },
    {
      id: "n6",
      parent_id: "n2",
      tag: "mov-instruction",
      branch: "main",
      is_main_path: true,
      relevance: 0.95,
      content_user: "Volviendo a x86, dame un ejemplo simple de MOV.",
      content_assistant: "MOV eax, 42 → carga el valor 42 en el registro eax. MOV ebx, eax → copia el contenido de eax a ebx. MOV [esi], eax → guarda el valor de eax en la posición de memoria apuntada por esi."
    },
    {
      id: "n7",
      parent_id: "n6",
      tag: "registers",
      branch: "main",
      is_main_path: true,
      relevance: 0.90,
      content_user: "¿Qué registros se pueden usar como destino?",
      content_assistant: "Los registros generales: eax, ebx, ecx, edx, esi, edi, ebp, esp (y sus variantes de 64 bits rax/rbx/etc., 16 bits ax/bx, 8 bits al/ah). esp y ebp suelen reservarse para el stack frame, así que en la práctica usás los otros para datos."
    },
    {
      id: "n8",
      parent_id: "n7",
      tag: "registers",
      branch: "regs-deep",
      is_main_path: false,
      relevance: 0.40,
      content_user: "¿Qué pasa si uso los registros de segmento como CS o DS?",
      content_assistant: "Los registros de segmento (CS, DS, SS, ES, FS, GS) tienen reglas especiales: no podés cargarles inmediatos directos, hay que pasar por un registro general primero. Y CS específicamente no se puede modificar con MOV (cambia con jumps far o iret)."
    },
    {
      id: "n9",
      parent_id: "n7",
      tag: "mov-instruction",
      branch: "main",
      is_main_path: true,
      relevance: 0.95,
      content_user: "Dame un ejemplo más complejo que combine todo.",
      content_assistant: "mov eax, [array+ecx*4] → carga en eax el elemento en el índice ecx de un array de 32-bit. La sintaxis [base+índice*escala+desplazamiento] es la forma direccionamiento efectivo en x86 — todo en una sola instrucción MOV."
    },
    {
      id: "n10",
      parent_id: "n9",
      tag: "mov-instruction",
      branch: "main",
      is_main_path: true,
      relevance: 1.0,
      content_user: "Perfecto, entendí por completo la instrucción MOV. Gracias.",
      content_assistant: "Genial. Resumen: MOV copia datos entre registros, memoria e inmediatos en x86; respeta la regla de no memoria-a-memoria; soporta direccionamiento efectivo complejo; y la sintaxis depende del ensamblador (Intel vs AT&T)."
    }
  ]
};
