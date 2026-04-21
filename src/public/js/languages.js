// Helper function to get token easily inside this script
const getAuthHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("app_token")}`,
});

// --- LOAD LANGUAGES ---
export async function loadLanguages() {
  try {
    const res = await fetch("/api/languages", { headers: getAuthHeaders() });
    if (!res.ok) return;
    const langs = await res.json();

    // 1. Populate Checkbox Containers (Áp dụng cho mọi form có class lang-checkbox-container)
    const checkboxContainers = document.querySelectorAll(
      ".lang-checkbox-container",
    );
    checkboxContainers.forEach((container) => {
      container.innerHTML = ""; // Remove "Loading..." text
      langs.forEach((l) => {
        container.innerHTML += `
          <label>
            <input type="checkbox" name="targetLangs" value="${l.code}">
            ${l.name} (${l.code})
          </label>
        `;
      });
      if (langs.length === 0) {
        container.innerHTML =
          '<span style="color: gray; font-size: 13px;">No languages configured in Admin tab.</span>';
      }
    });

    // 2. Populate Admin Table
    const tbody = document.getElementById("lang-list-tbody");
    if (tbody) {
      let html = "";
      langs.forEach((l) => {
        html += `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #1976d2;">${l.code}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">${l.name}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">
              <button onclick="deleteLanguage('${l.code}')" style="background: #ef4444; padding: 6px 12px; font-size: 12px;">Delete</button>
            </td>
          </tr>
        `;
      });
      tbody.innerHTML =
        html ||
        `<tr><td colspan="3" style="padding: 12px; text-align: center; color: gray;">No languages found. Please add some.</td></tr>`;
    }
  } catch (e) {
    console.error("Failed to load languages", e);
  }
}

// --- BIND EVENTS ---
export function initLanguageEvents() {
  // --- ADD LANGUAGE ---
  document
    .getElementById("form-add-lang")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = e.target.code.value;
      const name = e.target.name.value;
      const btn = document.getElementById("btn-add-lang");

      btn.disabled = true;
      btn.textContent = "Adding...";

      try {
        const res = await fetch("/api/languages/admin", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ code, name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        e.target.reset(); // Clear inputs
        loadLanguages(); // Reload tables & dropdowns
      } catch (err) {
        alert(`❌ Error: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = "Add Language";
      }
    });

  // --- DELETE LANGUAGE ---
  window.deleteLanguage = async function (code) {
    if (!confirm(`⚠️ Are you sure you want to delete the language '${code}'?`))
      return;

    try {
      const res = await fetch(`/api/languages/admin/${code}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message);
      loadLanguages(); // Reload tables & dropdowns
    } catch (e) {
      alert(`❌ Error: ${e.message}`);
    }
  };
}
