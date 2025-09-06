const input = document.getElementById("todo-input") as HTMLInputElement;
const button = document.getElementById("add-btn") as HTMLButtonElement;
const list = document.getElementById("todo-list") as HTMLUListElement;


button.addEventListener("click", () => {
    const value = input.value.trim();
    if (value) {
        const li = document.createElement("li");
        li.textContent = value;
        list.appendChild(li);
        input.value = "";
    }
});