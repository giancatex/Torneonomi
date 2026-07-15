import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Remove useGoogleLogin import
content = re.sub(r"import \{ useGoogleLogin \} from '@react-oauth/google';\n", "", content)

# Remove setGoogleAccessToken, getGoogleAccessToken, setAuthErrorCallback from api import
content = re.sub(r", setGoogleAccessToken, getGoogleAccessToken.* setAuthErrorCallback ", " ", content)

# Remove LogIn from lucide-react import
content = re.sub(r", LogIn ", " ", content)

# Remove isAuthenticated state and useEffect
content = re.sub(r"  const \[isAuthenticated.*?\];\n", "", content, flags=re.DOTALL)
content = re.sub(r"  useEffect\(\(\) => \{.*?  \}, \[\]\);\n", "", content, flags=re.DOTALL)

# Remove login function
content = re.sub(r"  const login = useGoogleLogin\(\{.*?\n  \}\);\n", "", content, flags=re.DOTALL)

# Replace the JSX render
jsx_to_replace = """        {!isAuthenticated ? (
          <div className="flex-1 flex flex-col justify-center items-center max-w-md mx-auto w-full gap-6">
            <div className="text-center space-y-2 mb-4">
              <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Autenticazione Richiesta</h2>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Accedi con Google per accedere ai dati del torneo.</p>
            </div>
            <button
              onClick={() => login()}
              className={`${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-slate-200 hover:bg-slate-50'} border rounded-xl p-6 transition-all flex items-center shadow-sm w-full justify-center`}
            >
              <LogIn className={`w-5 h-5 mr-3 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              <div className="text-left">
                <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>Accedi con Google</h3>
              </div>
            </button>
          </div>
        ) : currentPhase === 0 ? ("""

new_jsx = """        {currentPhase === 0 ? ("""

content = content.replace(jsx_to_replace, new_jsx)

# Also remove the GoogleOAuthProvider from main.tsx! Wait, main.tsx has it.
with open('src/App.tsx', 'w') as f:
    f.write(content)

