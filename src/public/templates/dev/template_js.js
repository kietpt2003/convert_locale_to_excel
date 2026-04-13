export default {
  sample_key_normal: "Sample Value",
  sample_key_with_variable: "Resend code in {seconds} seconds",
  sample_key_normal_2: 'Try to say "Hello"',
  sample_key_normal_3: "He's gay",
  sample_key_normal_4: `Try with this`,
  sample_with_html: `
  <!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>T&C - Sample</title>
    <style>
      .checkbox-group {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #fff;
        border-top: 1px solid #ddd;
        padding: 12px 20px;
        box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.05);
      }

      .checkbox-item {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
      }

      .checkbox-item input {
        margin-right: 8px;
        width: 18px;
        height: 18px;
      }

      .firstTitle {
        margin-top: 0;
      }

      .highlight {
        font-weight: bold;
        color: #0078c1;
      }

      body {
        font-family: sans-serif;
        color: #333;
        padding: 20px;
        margin: 0;
        padding-bottom: 150px;
      }

      h1 {
        font-size: 1em;
        color: #000;
      }
      h2 {
        font-size: 0.8em;
      }
      p,
      li {
        font-size: 14px;
      }
      ul {
        padding-left: 20px;
      }
      .p-bold {
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1 class="firstTitle">Poultry Coach Conditions of use</h1>

    <p>
      This Privacy policy sets the conditions of use ('Conditions of Use') set
      out the conditions subject to which the Sample App ('App') may be
      used.
    </p>

    <div class="checkbox-group">
      <div class="checkbox-item">
        <input type="checkbox" id="tnc1" />
        <label for="tnc1"
          >I confirm that I have read and accepted to the
          <span class="highlight">Terms of Services</span></label
        >
      </div>

      <div class="checkbox-item">
        <input type="checkbox" id="tnc2" />
        <label for="tnc2"
          >I confirm that I have read and accepted to the
          <a
            href="https://sample_link/privacy-policy"
            target="_blank"
            class="highlight"
            >Privacy Policy</a
          ></label
        >
      </div>
    </div>
  </body>
</html>
  `,
};
