document.addEventListener("DOMContentLoaded", () => {

  const token =
    localStorage.getItem("losub_token");

  const user =
    JSON.parse(
      localStorage.getItem("losub_user") || "null"
    );

  if (!user || !token) {
    window.location.href = "auth.html";
    return;
  }

  const fmt = n =>
    `₦${Math.abs(n).toLocaleString()}`;

  const typeIcon = {
    fund: "💰",
    fund_fee: "🧾",
    plan_payment: "📦",
    airtime: "📱",
    data: "📶"
  };

  const FUNDING_FEE = 100;

  let allTransactions = [];
  let visibleCount = 5;

  let currentRange = "all";
  let customFrom = null;
  let customTo = null;

  let currentBalance = 0;
  let selectedFundAmount = null;

  // -------------------------------------------------------
  // Transactions
  // -------------------------------------------------------

  function getFilteredTransactions() {

    if (
      currentRange === "all" &&
      !customFrom &&
      !customTo
    ) {
      return allTransactions;
    }

    const now = new Date();

    let start = null;

    if (currentRange === "today") {
      start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
    }

    else if (currentRange === "week") {
      start = new Date(now);
      start.setDate(
        now.getDate() - 7
      );
    }

    else if (currentRange === "month") {
      start = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );
    }

    return allTransactions.filter(tx => {

      const txDate =
        new Date(tx.created_at);

      if (
        customFrom &&
        txDate < new Date(customFrom)
      ) {
        return false;
      }

      if (
        customTo &&
        txDate >
          new Date(
            customTo + "T23:59:59"
          )
      ) {
        return false;
      }

      if (
        start &&
        !customFrom &&
        !customTo &&
        txDate < start
      ) {
        return false;
      }

      return true;
    });
  }

  function renderBalance() {

    document.getElementById(
      "walletBalance"
    ).textContent = fmt(currentBalance);
  }

  function renderTransactions() {

    const filtered =
      getFilteredTransactions();

    const list =
      document.getElementById("txList");

    const empty =
      document.getElementById("txEmpty");

    const viewMoreBtn =
      document.getElementById("viewMoreBtn");

    if (!filtered.length) {

      list.hidden = true;
      empty.hidden = false;
      viewMoreBtn.hidden = true;

      return;
    }

    list.hidden = false;
    empty.hidden = true;

    const visible =
      filtered.slice(
        0,
        visibleCount
      );

    list.innerHTML =
      visible.map(tx => {

        const isIn =
          tx.amount > 0;

        const dateStr =
          new Date(
            tx.created_at
          ).toLocaleDateString(
            "en-NG",
            {
              day: "numeric",
              month: "short",
              year: "numeric"
            }
          );

        return `
          <li class="tx-item">

            <span
              class="tx-item__icon ${
                isIn
                  ? "tx-item__icon--in"
                  : "tx-item__icon--out"
              }"
            >
              ${typeIcon[tx.type] || "💳"}
            </span>

            <div class="tx-item__body">

              <div class="tx-item__desc">
                ${tx.description}
              </div>

              <div class="tx-item__date">
                ${dateStr}
              </div>

            </div>

            <span
              class="tx-item__amount ${
                isIn
                  ? "tx-item__amount--in"
                  : "tx-item__amount--out"
              }"
            >
              ${isIn ? "+" : "-"}${fmt(tx.amount)}
            </span>

          </li>
        `;
      }).join("");

    viewMoreBtn.hidden =
      filtered.length <= visibleCount;
  }

  // -------------------------------------------------------
  // Load wallet
  // -------------------------------------------------------

  async function loadWallet() {

    try {

      const res =
        await fetch(
          `${API_ORIGIN}/api/wallet`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      if (res.status === 401) {
        window.location.href =
          "auth.html";
        return;
      }

      if (!res.ok) {
        throw new Error(
          "Request failed"
        );
      }

      const data =
        await res.json();

      currentBalance =
        data.balance;

      allTransactions =
        data.transactions;

      renderBalance();
      renderTransactions();

    } catch (err) {

      console.error(
        "Wallet loading error:",
        err
      );

      document.getElementById(
        "walletBalance"
      ).textContent =
        "Unavailable";
    }
  }

  // -------------------------------------------------------
  // View more
  // -------------------------------------------------------

  document
    .getElementById("viewMoreBtn")
    .addEventListener(
      "click",
      () => {

        visibleCount += 5;

        renderTransactions();
      }
    );

  // -------------------------------------------------------
  // Date filters
  // -------------------------------------------------------

  document
    .getElementById("dateFilterTabs")
    .addEventListener(
      "click",
      e => {

        const btn =
          e.target.closest(
            ".tab-bar__btn"
          );

        if (!btn) return;

        document
          .querySelectorAll(
            "#dateFilterTabs .tab-bar__btn"
          )
          .forEach(b =>
            b.classList.remove(
              "is-active"
            )
          );

        btn.classList.add(
          "is-active"
        );

        currentRange =
          btn.dataset.range;

        customFrom = null;
        customTo = null;

        document.getElementById(
          "dateFrom"
        ).value = "";

        document.getElementById(
          "dateTo"
        ).value = "";

        visibleCount = 5;

        renderTransactions();
      }
    );

  document
    .getElementById("applyCustomRange")
    .addEventListener(
      "click",
      () => {

        customFrom =
          document.getElementById(
            "dateFrom"
          ).value || null;

        customTo =
          document.getElementById(
            "dateTo"
          ).value || null;

        if (customFrom || customTo) {

          document
            .querySelectorAll(
              "#dateFilterTabs .tab-bar__btn"
            )
            .forEach(b =>
              b.classList.remove(
                "is-active"
              )
            );
        }

        visibleCount = 5;

        renderTransactions();
      }
    );

  // -------------------------------------------------------
  // Fund wallet modal
  // -------------------------------------------------------

  document
    .getElementById("openFundModal")
    .addEventListener(
      "click",
      () => {

        document.getElementById(
          "fundModalOverlay"
        ).hidden = false;
      }
    );

  document
    .getElementById("fundModalClose")
    .addEventListener(
      "click",
      closeFundModal
    );

  document
    .getElementById("fundModalOverlay")
    .addEventListener(
      "click",
      e => {

        if (
          e.target.id ===
          "fundModalOverlay"
        ) {
          closeFundModal();
        }
      }
    );

  function closeFundModal() {

    document.getElementById(
      "fundModalOverlay"
    ).hidden = true;

    selectedFundAmount = null;

    document.getElementById(
      "fundAmountInput"
    ).value = "";

    document
      .querySelectorAll(
        ".amount-chip"
      )
      .forEach(c =>
        c.classList.remove(
          "is-active"
        )
      );

    document.getElementById(
      "fundMessage"
    ).hidden = true;

    // FIX: Safely check if paystackFallbackBtn exists before accessing it
    const fallbackBtn =
      document.getElementById(
        "paystackFallbackBtn"
      );
    if (fallbackBtn) {
      fallbackBtn.hidden = true;
    }

    const btn =
      document.getElementById(
        "confirmFundBtn"
      );

    btn.disabled = false;
    btn.textContent =
      "Continue to payment";

    updateFeePreview();
  }

  // -------------------------------------------------------
  // Fee preview
  // -------------------------------------------------------

  function updateFeePreview() {

    const el =
      document.getElementById(
        "fundFeePreview"
      );

    if (!el) return;

    if (
      !selectedFundAmount ||
      selectedFundAmount <= FUNDING_FEE
    ) {

      el.textContent =
        `A ₦${FUNDING_FEE} funding fee applies to every top-up.`;

      return;
    }

    const net =
      selectedFundAmount -
      FUNDING_FEE;

    el.textContent =
      `₦${FUNDING_FEE} funding fee applies — you'll receive ₦${net.toLocaleString()} in your wallet.`;
  }

  // -------------------------------------------------------
  // Amount chips
  // -------------------------------------------------------

  document
    .querySelectorAll(
      ".amount-chip"
    )
    .forEach(chip => {

      chip.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(
              ".amount-chip"
            )
            .forEach(c =>
              c.classList.remove(
                "is-active"
              )
            );

          chip.classList.add(
            "is-active"
          );

          selectedFundAmount =
            Number(
              chip.dataset.amount
            );

          document.getElementById(
            "fundAmountInput"
          ).value =
            selectedFundAmount;

          updateFeePreview();
        }
      );
    });

  document
    .getElementById("fundAmountInput")
    .addEventListener(
      "input",
      e => {

        selectedFundAmount =
          Number(e.target.value) ||
          null;

        document
          .querySelectorAll(
            ".amount-chip"
          )
          .forEach(c =>
            c.classList.remove(
              "is-active"
            )
          );

        updateFeePreview();
      }
    );

  // -------------------------------------------------------
  // Show message
  // -------------------------------------------------------

  function showError(message) {

    const messageBox =
      document.getElementById(
        "fundMessage"
      );

    messageBox.textContent =
      message;

    messageBox.className =
      "airtime-message airtime-message--error";

    messageBox.hidden = false;
  }

  // -------------------------------------------------------
  // Flutterwave PRIMARY
  // -------------------------------------------------------

  async function startFlutterwavePayment() {

    const messageBox =
      document.getElementById(
        "fundMessage"
      );

    const btn =
      document.getElementById(
        "confirmFundBtn"
      );

    const fallbackBtn =
      document.getElementById(
        "paystackFallbackBtn"
      );

    if (
      !selectedFundAmount ||
      selectedFundAmount <= FUNDING_FEE
    ) {

      showError(
        `Enter a valid amount above ₦${FUNDING_FEE}.`
      );

      return;
    }

    btn.disabled = true;
    btn.textContent =
      "Opening Flutterwave…";

    // FIX: Safely check if fallbackBtn exists before setting hidden to prevent uncaught TypeError
    if (fallbackBtn) {
      fallbackBtn.hidden = true;
    }
    messageBox.hidden = true;

    try {

      const res =
        await fetch(
          `${API_ORIGIN}/api/wallet/fund/flutterwave`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },

            body: JSON.stringify({
              amount:
                selectedFundAmount,
            }),
          }
        );

      const data =
        await res.json();

      if (
        !res.ok ||
        !data.checkout_url
      ) {

        throw new Error(
          data.error ||
          "Flutterwave could not start the payment."
        );
      }

      /*
       * Save the amount locally so that if Flutterwave
       * redirects back to wallet.html, the UI can still
       * show a useful state.
       */
      sessionStorage.setItem(
        "losub_payment_gateway",
        "flutterwave"
      );

      window.location.href =
        data.checkout_url;

    } catch (err) {

      console.error(
        "Flutterwave payment error:",
        err
      );

      btn.disabled = false;
      btn.textContent =
        "Continue to payment";

      showError(
        err.message ||
        "Flutterwave is currently unavailable."
      );

      // ---------------------------------------------------
      // Offer Paystack as backup.
      // ---------------------------------------------------

      // FIX: Safely show fallbackBtn only if present in DOM
      if (fallbackBtn) {
        fallbackBtn.hidden = false;
      }
    }
  }

  // FIX: Support the paymentMethod radio selection (Flutterwave vs Paystack)
  document
    .getElementById("confirmFundBtn")
    .addEventListener(
      "click",
      () => {
        const selectedMethod =
          document.querySelector('input[name="paymentMethod"]:checked')?.value ||
          "flutterwave";

        if (selectedMethod === "paystack") {
          startPaystackFallback();
        } else {
          startFlutterwavePayment();
        }
      }
    );

  // -------------------------------------------------------
  // Paystack BACKUP (if fallback button exists in DOM)
  // -------------------------------------------------------

  // FIX: Check if paystackFallbackBtn exists before adding event listener
  const fallbackEl =
    document.getElementById("paystackFallbackBtn");

  if (fallbackEl) {
    fallbackEl.addEventListener(
      "click",
      startPaystackFallback
    );
  }

  function startPaystackFallback() {

    if (
      !selectedFundAmount ||
      selectedFundAmount <= FUNDING_FEE
    ) {

      showError(
        `Enter a valid amount above ₦${FUNDING_FEE}.`
      );

      return;
    }

    if (
      typeof PaystackPop ===
      "undefined"
    ) {

      showError(
        "Paystack failed to load. Refresh and try again."
      );

      return;
    }

    const btn =
      document.getElementById(
        "confirmFundBtn"
      );

    const fallbackBtn =
      document.getElementById(
        "paystackFallbackBtn"
      );

    btn.disabled = true;
    // FIX: Safely check fallbackBtn before disabling
    if (fallbackBtn) {
      fallbackBtn.disabled = true;
    }

    btn.textContent =
      "Opening Paystack…";

    const handler =
      PaystackPop.setup({

        key:
          PAYSTACK_PUBLIC_KEY,

        email:
          user.email,

        amount:
          selectedFundAmount * 100,

        currency:
          "NGN",

        ref:
          `losub_paystack_${user.id}_${Date.now()}`,

        callback:
          function(response) {

            btn.textContent =
              "Confirming Paystack…";

            fetch(
              `${API_ORIGIN}/api/wallet/fund/paystack/verify`,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  Authorization:
                    `Bearer ${token}`,
                },

                body: JSON.stringify({
                  reference:
                    response.reference,
                }),
              }
            )
              .then(res =>
                res.json()
              )
              .then(data => {

                btn.disabled = false;
                // FIX: Safely check fallbackBtn
                if (fallbackBtn) {
                  fallbackBtn.disabled = false;
                }

                btn.textContent =
                  "Continue to payment";

                if (
                  data.balance ===
                  undefined
                ) {

                  showError(
                    data.error ||
                    "Couldn't confirm the Paystack payment."
                  );

                  return;
                }

                currentBalance =
                  data.balance;

                renderBalance();

                closeFundModal();

                loadWallet();
              })
              .catch(() => {

                btn.disabled = false;
                // FIX: Safely check fallbackBtn
                if (fallbackBtn) {
                  fallbackBtn.disabled = false;
                }

                btn.textContent =
                  "Continue to payment";

                showError(
                  "Payment succeeded but confirmation failed. Contact support with your Paystack reference: " +
                  response.reference
                );
              });
          },

        onClose:
          function() {

            btn.disabled = false;
            // FIX: Safely check fallbackBtn
            if (fallbackBtn) {
              fallbackBtn.disabled = false;
            }

            btn.textContent =
              "Continue to payment";
          },
      });

    handler.openIframe();
  }

  // -------------------------------------------------------
  // Handle Flutterwave redirect
  // -------------------------------------------------------

  async function handleFlutterwaveRedirect() {

    const params =
      new URLSearchParams(
        window.location.search
      );

    const status =
      (params.get("status") || "").toLowerCase();

    const txRef =
      params.get("tx_ref");

    // FIX: Accept both transaction_id and id query parameters from Flutterwave
    const transactionId =
      params.get("transaction_id") || params.get("id");

    if (
      !txRef ||
      !transactionId
    ) {
      return;
    }

    // Remove payment parameters from the address bar.
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );

    // FIX: Open modal so user sees confirmation status and any messages
    const modalOverlay =
      document.getElementById(
        "fundModalOverlay"
      );
    if (modalOverlay) {
      modalOverlay.hidden = false;
    }

    const messageBox =
      document.getElementById(
        "fundMessage"
      );

    const btn =
      document.getElementById(
        "confirmFundBtn"
      );

    btn.disabled = true;
    btn.textContent =
      "Verifying payment…";

    messageBox.hidden = false;
    messageBox.className =
      "airtime-message";
    messageBox.textContent =
      "Confirming your Flutterwave payment…";

    if (
      status &&
      status !== "successful" &&
      status !== "completed"
    ) {

      btn.disabled = false;
      btn.textContent =
        "Continue to payment";

      showError(
        "The Flutterwave payment was not successful."
      );

      return;
    }

    try {

      const res =
        await fetch(
          `${API_ORIGIN}/api/wallet/fund/verify`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },

            body: JSON.stringify({
              transaction_id:
                transactionId,

              tx_ref:
                txRef,
            }),
          }
        );

      const data =
        await res.json();

      if (
        !res.ok ||
        data.balance ===
          undefined
      ) {

        throw new Error(
          data.error ||
          "Payment could not be verified."
        );
      }

      currentBalance =
        data.balance;

      renderBalance();

      closeFundModal();

      await loadWallet();

    } catch (err) {

      console.error(
        "Flutterwave redirect verification error:",
        err
      );

      btn.disabled = false;
      btn.textContent =
        "Continue to payment";

      showError(
        err.message ||
        `Payment verification failed. Keep your reference ${txRef} and contact support if money was deducted.`
      );
    }
  }

  // -------------------------------------------------------
  // Download PDF
  // -------------------------------------------------------

  document
    .getElementById("downloadPdfBtn")
    .addEventListener(
      "click",
      () => {

        const { jsPDF } =
          window.jspdf;

        const doc =
          new jsPDF();

        const transactions =
          getFilteredTransactions();

        doc.setFontSize(16);

        doc.text(
          "Losub — Wallet Statement",
          14,
          18
        );

        doc.setFontSize(10);

        doc.text(
          `Generated: ${new Date().toLocaleDateString()}`,
          14,
          25
        );

        doc.text(
          `Balance: ${fmt(currentBalance)}`,
          14,
          31
        );

        let y = 42;

        doc.setFontSize(11);

        doc.text(
          "Date",
          14,
          y
        );

        doc.text(
          "Description",
          55,
          y
        );

        doc.text(
          "Amount",
          170,
          y
        );

        y += 6;

        doc.line(
          14,
          y - 3,
          196,
          y - 3
        );

        transactions.forEach(
          tx => {

            if (y > 280) {
              doc.addPage();
              y = 20;
            }

            const dateStr =
              new Date(
                tx.created_at
              ).toLocaleDateString(
                "en-NG",
                {
                  day: "numeric",
                  month: "short",
                  year: "numeric"
                }
              );

            const amountStr =
              `${
                tx.amount > 0
                  ? "+"
                  : "-"
              }${fmt(tx.amount)}`;

            doc.text(
              dateStr,
              14,
              y
            );

            doc.text(
              tx.description,
              55,
              y
            );

            doc.text(
              amountStr,
              170,
              y
            );

            y += 8;
          }
        );

        doc.save(
          "losub-wallet-statement.pdf"
        );
      }
    );

  // -------------------------------------------------------
  // Initial load
  // -------------------------------------------------------

  // FIX: Await redirect verification before loading wallet balance to avoid race conditions
  (async function init() {
    await handleFlutterwaveRedirect();
    await loadWallet();
  })();
});