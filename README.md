Curves API - Visualizador de Perfis Compostos

Sistema para visualização de perfis compostos de poços petrolíferos com geração dinâmica de gráficos SVG.

## 🚀 Quick Start

```bash
# Instalar dependências
npm install

# Modo desenvolvimento
npm run dev

# Abrir no navegador
http://localhost:3001


📋 Funcionalidades

✅ Interface intuitiva para entrada de parâmetros
✅ Seleção múltipla de curvas (GR, RHOB, NPHI)
✅ Opção de incluir/excluir litologia
✅ Geração dinâmica de SVG baseada nos parâmetros
✅ Download do perfil gerado
✅ Visualização em tela cheia
✅ Console de debug integrado

🛠️ Tecnologias

Backend: Node.js + Express
Frontend: HTML5 + CSS3 + JavaScript Vanilla
Visualização: SVG dinâmico
API: REST com mock funcional

📁 Estrutura do Projeto

curves-api/
├── server.js          # Servidor Express e API mock
├── package.json       # Dependências e scripts
├── .env               # Variáveis de ambiente (criar localmente)
├── .gitignore         # Arquivos ignorados pelo Git
├── README.md          # Documentação
└── public/            # Frontend
    ├── index.html     # Estrutura HTML
    ├── styles.css     # Estilos
    └── app.js         # Lógica JavaScript


🔧 API Endpoints

POST /api/generate-profile
Gera um perfil composto baseado nos parâmetros.
Request:
json{
  "well": "1-SL-1-RN",
  "curves": ["GR", "RHOB", "NPHI"],
  "hasLito": true
}
Response: Imagem SVG

GET /api/health
Verifica status da API.
🎨 Parâmetros de Visualização

well: Nome do poço (string)
curves: Array de curvas a exibir (GR, RHOB, NPHI)
hasLito: Incluir coluna de litologia (boolean)

📝 Desenvolvimento
Modo Debug
O console de debug pode ser ativado:

Clicando no botão "Debug" no rodapé
Pressionando Ctrl+D (ou Cmd+D no Mac)

Atalhos de Teclado

Ctrl+Enter: Gerar perfil
Ctrl+D: Toggle debug console

🚦 Status do Projeto

 Estrutura base
 API mock funcional
 Interface completa
 Geração dinâmica de SVG
 Sistema de debug
 Integração com API externa real
 Mais tipos de curvas
 Export em diferentes formatos
 Deploy em produção

👨‍💻 Autor
Ivan Leituga - Estagiário de Desenvolvimento

📄 Licença
Projeto interno - Todos os direitos reservados
