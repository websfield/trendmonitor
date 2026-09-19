/* @ds-bundle: {"format":3,"namespace":"MenubookDesignSystem_3a57e3","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"Avatar","sourcePath":"components/data-display/Avatar.jsx"},{"name":"Card","sourcePath":"components/data-display/Card.jsx"},{"name":"RatingStars","sourcePath":"components/data-display/RatingStars.jsx"},{"name":"StatCard","sourcePath":"components/data-display/StatCard.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"Chip","sourcePath":"components/feedback/Chip.jsx"},{"name":"StatusPill","sourcePath":"components/feedback/StatusPill.jsx"},{"name":"SearchField","sourcePath":"components/forms/SearchField.jsx"},{"name":"SegmentedControl","sourcePath":"components/forms/SegmentedControl.jsx"},{"name":"MenuItemRow","sourcePath":"components/menubook/MenuItemRow.jsx"},{"name":"PointsBalance","sourcePath":"components/menubook/PointsBalance.jsx"},{"name":"RestaurantCard","sourcePath":"components/menubook/RestaurantCard.jsx"},{"name":"RewardPill","sourcePath":"components/menubook/RewardPill.jsx"},{"name":"BottomNav","sourcePath":"components/navigation/BottomNav.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"05700b284d6a","components/actions/IconButton.jsx":"06c7b9e03fb5","components/data-display/Avatar.jsx":"e4549d2974a2","components/data-display/Card.jsx":"830035394332","components/data-display/RatingStars.jsx":"6a74a4bcab99","components/data-display/StatCard.jsx":"d023768b29c8","components/feedback/Badge.jsx":"3066829b0c83","components/feedback/Chip.jsx":"29da95241c73","components/feedback/StatusPill.jsx":"faff8b494b17","components/forms/SearchField.jsx":"8733dd7c153f","components/forms/SegmentedControl.jsx":"e750e52676c1","components/menubook/MenuItemRow.jsx":"c925221c783c","components/menubook/PointsBalance.jsx":"1806035125b4","components/menubook/RestaurantCard.jsx":"a0ca8377775f","components/menubook/RewardPill.jsx":"2145b3e5f00a","components/navigation/BottomNav.jsx":"593a442058ef","components/navigation/Tabs.jsx":"11834215f17b","ui_kits/diner/BillScreen.jsx":"e9b6383fe949","ui_kits/diner/DinerApp.jsx":"250895b0410b","ui_kits/diner/DiscoverScreen.jsx":"9fcfcc15613d","ui_kits/diner/PhoneFrame.jsx":"b0f02166342d","ui_kits/diner/RestaurantScreen.jsx":"a8016953e68d","ui_kits/diner/RewardsScreen.jsx":"166090cae085","ui_kits/diner/SessionScreen.jsx":"b2618d8df5a1"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.MenubookDesignSystem_3a57e3 = window.MenubookDesignSystem_3a57e3 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook Button — the primary action primitive.
 * Variants map to the brand board: primary (green), secondary (outline),
 * reward (golden), ghost, danger. Min height honours the 44px tap target.
 */
function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  loading = false,
  loadingText,
  iconLeft = null,
  iconRight = null,
  type = "button",
  onClick,
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      height: 36,
      padding: "0 14px",
      font: "var(--text-body-sm)",
      gap: 6,
      radius: "var(--radius-md)"
    },
    md: {
      height: 44,
      padding: "0 18px",
      font: "var(--text-body)",
      gap: 8,
      radius: "var(--radius-button)"
    },
    lg: {
      height: 52,
      padding: "0 24px",
      font: "var(--text-body-lg)",
      gap: 10,
      radius: "var(--radius-button)"
    }
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    primary: {
      background: "var(--color-primary)",
      color: "var(--color-on-primary)",
      border: "1px solid transparent"
    },
    secondary: {
      background: "transparent",
      color: "var(--color-text)",
      border: "1px solid var(--color-border-strong)"
    },
    reward: {
      background: "var(--color-reward)",
      color: "var(--color-on-reward)",
      border: "1px solid transparent"
    },
    accent: {
      background: "var(--color-accent)",
      color: "var(--color-on-accent)",
      border: "1px solid transparent"
    },
    ghost: {
      background: "transparent",
      color: "var(--color-text)",
      border: "1px solid transparent"
    },
    danger: {
      background: "var(--color-danger)",
      color: "#fff",
      border: "1px solid transparent"
    }
  };
  const v = variants[variant] || variants.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled || loading,
    onClick: onClick,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: s.gap,
      width: fullWidth ? "100%" : "auto",
      minHeight: s.height,
      height: s.height,
      padding: s.padding,
      fontFamily: "var(--font-sans)",
      fontSize: s.font,
      fontWeight: "var(--weight-bold)",
      letterSpacing: "var(--tracking-snug)",
      lineHeight: 1,
      borderRadius: s.radius,
      cursor: disabled || loading ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
      whiteSpace: "nowrap",
      ...v,
      ...style
    },
    onMouseDown: e => {
      if (!disabled && !loading) e.currentTarget.style.transform = "scale(0.97)";
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = "scale(1)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = "scale(1)";
    }
  }, rest), loading ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Spinner, null), loadingText || children) : /*#__PURE__*/React.createElement(React.Fragment, null, iconLeft ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      fontSize: "1.2em"
    }
  }, iconLeft) : null, children, iconRight ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      fontSize: "1.2em"
    }
  }, iconRight) : null));
}
function Spinner() {
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 15,
      height: 15,
      borderRadius: "50%",
      border: "2px solid currentColor",
      borderTopColor: "transparent",
      display: "inline-block",
      animation: "mb-spin 0.7s linear infinite"
    }
  });
}
if (typeof document !== "undefined" && !document.getElementById("mb-spin-kf")) {
  const el = document.createElement("style");
  el.id = "mb-spin-kf";
  el.textContent = "@keyframes mb-spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(el);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/actions/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook IconButton — a square, icon-only tap target (bell, heart, share,
 * the green "＋" add control, etc). Pass a Phosphor <i className="ph ph-…"/>
 * or any node as `icon`. Always provide `ariaLabel`.
 */
function IconButton({
  icon,
  ariaLabel,
  variant = "ghost",
  size = "md",
  disabled = false,
  onClick,
  style,
  ...rest
}) {
  const sizes = {
    sm: 36,
    md: 44,
    lg: 52
  };
  const dim = sizes[size] || sizes.md;
  const variants = {
    primary: {
      background: "var(--color-primary)",
      color: "var(--color-on-primary)",
      border: "1px solid transparent"
    },
    reward: {
      background: "var(--color-reward)",
      color: "var(--color-on-reward)",
      border: "1px solid transparent"
    },
    surface: {
      background: "var(--color-surface)",
      color: "var(--color-text)",
      border: "1px solid var(--color-border)"
    },
    ghost: {
      background: "transparent",
      color: "var(--color-text)",
      border: "1px solid transparent"
    }
  };
  const v = variants[variant] || variants.ghost;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": ariaLabel,
    disabled: disabled,
    onClick: onClick,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: dim,
      height: dim,
      minHeight: dim,
      fontSize: size === "sm" ? 18 : 21,
      borderRadius: variant === "primary" || variant === "reward" ? "var(--radius-full)" : "var(--radius-md)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard)",
      ...v,
      ...style
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = "scale(0.92)";
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = "scale(1)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = "scale(1)";
    }
  }, rest), icon);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook Avatar — diner / venue / staff identity. Shows `src` image or
 * falls back to initials on a warm tint.
 */
function Avatar({
  src,
  name = "",
  size = "md",
  style,
  ...rest
}) {
  const sizes = {
    sm: 28,
    md: 40,
    lg: 56
  };
  const dim = sizes[size] || (typeof size === "number" ? size : 40);
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: dim,
      height: dim,
      borderRadius: "var(--radius-full)",
      overflow: "hidden",
      flex: "0 0 auto",
      background: "var(--color-primary-subtle)",
      color: "var(--color-primary-subtle-fg)",
      fontFamily: "var(--font-sans)",
      fontSize: dim * 0.38,
      fontWeight: "var(--weight-bold)",
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : initials || "·");
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook Card — the surface container. `elevated` adds the brand shadow;
 * `interactive` adds hover lift for tappable cards (restaurant tiles, etc).
 */
function Card({
  children,
  elevated = false,
  interactive = false,
  padding = 16,
  as = "div",
  style,
  ...rest
}) {
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: {
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-card)",
      boxShadow: elevated ? "var(--shadow-card)" : "none",
      padding,
      transition: "transform var(--duration-base) var(--ease-out), box-shadow var(--duration-base) var(--ease-out), border-color var(--duration-base) var(--ease-out)",
      cursor: interactive ? "pointer" : "default",
      ...style
    },
    onMouseEnter: interactive ? e => {
      e.currentTarget.style.transform = "translateY(-2px)";
      e.currentTarget.style.boxShadow = "var(--shadow-md)";
      e.currentTarget.style.borderColor = "var(--color-border-strong)";
    } : undefined,
    onMouseLeave: interactive ? e => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.boxShadow = elevated ? "var(--shadow-card)" : "none";
      e.currentTarget.style.borderColor = "var(--color-border)";
    } : undefined
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Card.jsx", error: String((e && e.message) || e) }); }

// components/data-display/RatingStars.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook RatingStars — venue rating. Renders a golden star, the numeric
 * score, and optional review count, matching the storefront concept.
 */
function RatingStars({
  value = 0,
  count,
  showValue = true,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: "var(--color-star)",
      fontSize: "1.05em",
      lineHeight: 1
    }
  }, "\u2605"), showValue ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-body-sm)",
      fontWeight: "var(--weight-bold)",
      color: "var(--color-text)"
    }
  }, value.toFixed(1)) : null, typeof count === "number" ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-body-sm)",
      color: "var(--color-text-muted)"
    }
  }, "(", count, ")") : null);
}
Object.assign(__ds_scope, { RatingStars });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/RatingStars.jsx", error: String((e && e.message) || e) }); }

// components/data-display/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook StatCard — a dashboard metric tile (Orders, Revenue, "Money you've
 * kept"…). `highlight` paints it in the reward/golden treatment for the hero
 * operator-value metric.
 */
function StatCard({
  label,
  value,
  delta,
  deltaDirection = "up",
  icon = null,
  highlight = false,
  caption,
  style,
  ...rest
}) {
  const deltaColor = deltaDirection === "down" ? "var(--color-danger)" : "var(--color-success)";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: highlight ? "var(--color-reward-subtle)" : "var(--color-surface)",
      border: `1px solid ${highlight ? "var(--color-reward)" : "var(--color-border)"}`,
      borderRadius: "var(--radius-card)",
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-caption)",
      fontWeight: "var(--weight-medium)",
      color: "var(--color-text-muted)"
    }
  }, label), icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      fontSize: 18,
      color: highlight ? "var(--color-reward-subtle-fg)" : "var(--color-text-subtle)"
    }
  }, icon) : null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-h1)",
      fontWeight: "var(--weight-black)",
      letterSpacing: "var(--tracking-tight)",
      color: highlight ? "var(--color-reward-subtle-fg)" : "var(--color-text)",
      lineHeight: 1
    }
  }, value), delta ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: "var(--text-caption)",
      fontWeight: "var(--weight-bold)",
      color: deltaColor
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, deltaDirection === "down" ? "↓" : "↑"), delta) : null, caption ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-caption)",
      color: "var(--color-text-muted)"
    }
  }, caption) : null);
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook Badge — a tiny count or dot indicator, e.g. on a nav icon or the
 * cart. Use `dot` for a presence indicator with no number.
 */
function Badge({
  count,
  dot = false,
  tone = "accent",
  max = 99,
  style,
  ...rest
}) {
  const tones = {
    accent: {
      bg: "var(--color-accent)",
      fg: "var(--color-on-accent)"
    },
    primary: {
      bg: "var(--color-primary)",
      fg: "var(--color-on-primary)"
    },
    reward: {
      bg: "var(--color-reward)",
      fg: "var(--color-on-reward)"
    },
    danger: {
      bg: "var(--color-danger)",
      fg: "#fff"
    },
    neutral: {
      bg: "var(--color-surface-3)",
      fg: "var(--color-text)"
    }
  };
  const t = tones[tone] || tones.accent;
  if (dot) {
    return /*#__PURE__*/React.createElement("span", _extends({
      style: {
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: t.bg,
        display: "inline-block",
        border: "2px solid var(--color-bg)",
        ...style
      }
    }, rest));
  }
  const display = typeof count === "number" && count > max ? `${max}+` : count;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 18,
      height: 18,
      padding: "0 5px",
      fontFamily: "var(--font-sans)",
      fontSize: 11,
      fontWeight: "var(--weight-bold)",
      lineHeight: 1,
      borderRadius: "var(--radius-full)",
      background: t.bg,
      color: t.fg,
      ...style
    }
  }, rest), display);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook Chip — a compact pill for tags, filters and inline metadata.
 * Tones map to the semantic palette; `selected` gives it a filled "active"
 * look for filter rows.
 */
function Chip({
  children,
  tone = "neutral",
  selected = false,
  leadingIcon = null,
  size = "md",
  onClick,
  style,
  ...rest
}) {
  const tones = {
    neutral: {
      fg: "var(--color-text-muted)",
      bg: "var(--color-surface-2)",
      bd: "var(--color-border)",
      selFg: "var(--color-on-primary)",
      selBg: "var(--color-primary)"
    },
    reward: {
      fg: "var(--color-reward-subtle-fg)",
      bg: "var(--color-reward-subtle)",
      bd: "var(--color-reward)",
      selFg: "var(--color-on-reward)",
      selBg: "var(--color-reward)"
    },
    success: {
      fg: "var(--color-status-ready-fg)",
      bg: "var(--color-status-ready-bg)",
      bd: "transparent",
      selFg: "#fff",
      selBg: "var(--color-success)"
    },
    preparing: {
      fg: "var(--color-status-preparing-fg)",
      bg: "var(--color-status-preparing-bg)",
      bd: "transparent",
      selFg: "var(--color-on-reward)",
      selBg: "var(--color-status-preparing)"
    },
    accent: {
      fg: "var(--color-accent-subtle-fg)",
      bg: "var(--color-accent-subtle)",
      bd: "transparent",
      selFg: "var(--color-on-accent)",
      selBg: "var(--color-accent)"
    }
  };
  const t = tones[tone] || tones.neutral;
  const interactive = typeof onClick === "function";
  return /*#__PURE__*/React.createElement("span", _extends({
    role: interactive ? "button" : undefined,
    tabIndex: interactive ? 0 : undefined,
    onClick: onClick,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: size === "sm" ? 24 : 30,
      padding: size === "sm" ? "0 9px" : "0 12px",
      fontFamily: "var(--font-sans)",
      fontSize: size === "sm" ? "var(--text-overline)" : "var(--text-caption)",
      fontWeight: "var(--weight-bold)",
      letterSpacing: "var(--tracking-snug)",
      lineHeight: 1,
      borderRadius: "var(--radius-chip)",
      whiteSpace: "nowrap",
      cursor: interactive ? "pointer" : "default",
      color: selected ? t.selFg : t.fg,
      background: selected ? t.selBg : t.bg,
      border: `1px solid ${selected ? "transparent" : t.bd}`,
      transition: "background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)",
      ...style
    }
  }, rest), leadingIcon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      fontSize: "1.15em"
    }
  }, leadingIcon) : null, children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Chip.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StatusPill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook StatusPill — order-lifecycle state with a leading dot and a
 * mandatory text label (Mesa never signals state by colour alone).
 */
function StatusPill({
  status = "new",
  label,
  style,
  ...rest
}) {
  const map = {
    new: {
      fg: "var(--color-status-new-fg)",
      bg: "var(--color-status-new-bg)",
      dot: "var(--color-status-new)",
      text: "New"
    },
    preparing: {
      fg: "var(--color-status-preparing-fg)",
      bg: "var(--color-status-preparing-bg)",
      dot: "var(--color-status-preparing)",
      text: "Preparing"
    },
    ready: {
      fg: "var(--color-status-ready-fg)",
      bg: "var(--color-status-ready-bg)",
      dot: "var(--color-status-ready)",
      text: "Ready"
    },
    confirmed: {
      fg: "var(--color-status-ready-fg)",
      bg: "var(--color-status-ready-bg)",
      dot: "var(--color-status-ready)",
      text: "Confirmed"
    },
    waitlist: {
      fg: "var(--color-status-preparing-fg)",
      bg: "var(--color-status-preparing-bg)",
      dot: "var(--color-status-preparing)",
      text: "Waitlist"
    },
    seated: {
      fg: "var(--color-status-ready-fg)",
      bg: "var(--color-status-ready-bg)",
      dot: "var(--color-status-ready)",
      text: "Seated"
    },
    neutral: {
      fg: "var(--color-status-neutral)",
      bg: "var(--color-status-neutral-bg)",
      dot: "var(--color-status-neutral)",
      text: "—"
    }
  };
  const s = map[status] || map.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      height: 26,
      padding: "0 11px 0 9px",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-caption)",
      fontWeight: "var(--weight-bold)",
      lineHeight: 1,
      borderRadius: "var(--radius-chip)",
      color: s.fg,
      background: s.bg,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: s.dot,
      flex: "0 0 auto"
    }
  }), label || s.text);
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchField.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook SearchField — rounded search input with a leading icon, matching
 * the storefront "Search restaurants, cuisines…" bar.
 */
function SearchField({
  value,
  onChange,
  placeholder = "Search restaurants, cuisines…",
  leadingIcon = null,
  trailing = null,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      height: 48,
      padding: "0 14px",
      background: "var(--color-surface-2)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-full)",
      color: "var(--color-text-muted)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: "inline-flex",
      fontSize: 19,
      color: "var(--color-text-subtle)"
    }
  }, leadingIcon || "⌕"), /*#__PURE__*/React.createElement("input", _extends({
    type: "search",
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    style: {
      flex: 1,
      minWidth: 0,
      border: "none",
      outline: "none",
      background: "transparent",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-body)",
      color: "var(--color-text)"
    }
  }, rest)), trailing);
}
Object.assign(__ds_scope, { SearchField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchField.jsx", error: String((e && e.message) || e) }); }

// components/forms/SegmentedControl.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook SegmentedControl — a pill-track of mutually exclusive options
 * (Menu/Drinks/Desserts, Dine-in/Pickup/Delivery, kitchen filters). The
 * active segment slides on a green (or themed) fill.
 */
function SegmentedControl({
  options = [],
  value,
  onChange,
  tone = "primary",
  size = "md",
  fullWidth = false,
  style,
  ...rest
}) {
  const tones = {
    primary: {
      bg: "var(--color-primary)",
      fg: "var(--color-on-primary)"
    },
    surface: {
      bg: "var(--color-surface-3)",
      fg: "var(--color-text)"
    },
    reward: {
      bg: "var(--color-reward)",
      fg: "var(--color-on-reward)"
    }
  };
  const t = tones[tone] || tones.primary;
  const h = size === "sm" ? 34 : 42;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: "inline-flex",
      width: fullWidth ? "100%" : "auto",
      padding: 4,
      gap: 4,
      background: "var(--color-surface-2)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-full)",
      ...style
    }
  }, rest), options.map(opt => {
    const val = typeof opt === "string" ? opt : opt.value;
    const label = typeof opt === "string" ? opt : opt.label;
    const active = val === value;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      role: "tab",
      "aria-selected": active,
      onClick: () => onChange && onChange(val),
      style: {
        flex: fullWidth ? 1 : "0 0 auto",
        height: h,
        minHeight: h,
        padding: "0 16px",
        border: "none",
        borderRadius: "var(--radius-full)",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: size === "sm" ? "var(--text-body-sm)" : "var(--text-body)",
        fontWeight: "var(--weight-bold)",
        whiteSpace: "nowrap",
        background: active ? t.bg : "transparent",
        color: active ? t.fg : "var(--color-text-muted)",
        boxShadow: active ? "var(--shadow-xs)" : "none",
        transition: "background var(--duration-base) var(--ease-out), color var(--duration-base) var(--ease-out)"
      }
    }, label);
  }));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/menubook/MenuItemRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook MenuItemRow — a menu line with a food thumbnail, name, optional
 * description, price, and a round green "＋" add control. The core building
 * block of the QR ordering and menu screens.
 */
function MenuItemRow({
  name,
  description,
  price,
  image,
  onAdd,
  addLabel = "Add",
  trailing,
  soldOut = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: 12,
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-card)",
      opacity: soldOut ? 0.55 : 1,
      ...style
    }
  }, rest), image ? /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: "",
    style: {
      width: 64,
      height: 64,
      borderRadius: "var(--radius-md)",
      objectFit: "cover",
      flex: "0 0 auto"
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: "var(--radius-md)",
      background: "var(--color-surface-3)",
      flex: "0 0 auto"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-body)",
      fontWeight: "var(--weight-bold)",
      color: "var(--color-text)"
    }
  }, name), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-caption)",
      color: "var(--color-text-muted)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 1,
      WebkitBoxOrient: "vertical"
    }
  }, description) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-body-sm)",
      fontWeight: "var(--weight-bold)",
      color: "var(--color-text)"
    }
  }, price)), trailing || (soldOut ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-caption)",
      fontWeight: "var(--weight-bold)",
      color: "var(--color-text-subtle)",
      whiteSpace: "nowrap"
    }
  }, "Sold out") : /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": `${addLabel} ${name}`,
    onClick: onAdd,
    style: {
      width: 40,
      height: 40,
      minHeight: 40,
      flex: "0 0 auto",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--radius-full)",
      border: "none",
      cursor: "pointer",
      background: "var(--color-primary)",
      color: "var(--color-on-primary)",
      fontSize: 22,
      lineHeight: 1,
      transition: "transform var(--duration-fast) var(--ease-spring)"
    },
    onMouseDown: e => {
      e.currentTarget.style.transform = "scale(0.88)";
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = "scale(1)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = "scale(1)";
    }
  }, "\uFF0B")));
}
Object.assign(__ds_scope, { MenuItemRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/menubook/MenuItemRow.jsx", error: String((e && e.message) || e) }); }

// components/menubook/PointsBalance.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook PointsBalance — the diner's Bites balance header. Big black number,
 * the cash-equivalent value underneath, matching the storefront "1,250 pts
 * ($12.50 value)" treatment.
 */
function PointsBalance({
  points = 0,
  value,
  label = "Your balance",
  align = "left",
  style,
  ...rest
}) {
  const fmt = typeof points === "number" ? points.toLocaleString() : points;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2,
      alignItems: align === "center" ? "center" : "flex-start",
      ...style
    }
  }, rest), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-body-sm)",
      color: "var(--color-text-muted)"
    }
  }, label) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "baseline",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-h1)",
      fontWeight: "var(--weight-black)",
      letterSpacing: "var(--tracking-tight)",
      color: "var(--color-text)",
      lineHeight: 1
    }
  }, fmt), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-h4)",
      fontWeight: "var(--weight-bold)",
      color: "var(--color-text-muted)"
    }
  }, "pts")), value ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-caption)",
      color: "var(--color-text-subtle)"
    }
  }, "(", value, " value)") : null);
}
Object.assign(__ds_scope, { PointsBalance });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/menubook/PointsBalance.jsx", error: String((e && e.message) || e) }); }

// components/menubook/RestaurantCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook RestaurantCard — a discovery tile: a food image (or 2-up collage),
 * the venue name, cuisine · distance · rating meta line, and a "% back in
 * points" reward line, matching the storefront "Nearby favourites" cards.
 */
function RestaurantCard({
  name,
  meta,
  images = [],
  rating,
  reviewCount,
  rewardLabel,
  onClick,
  style,
  ...rest
}) {
  const imgs = images.slice(0, 2);
  return /*#__PURE__*/React.createElement("div", _extends({
    role: onClick ? "button" : undefined,
    onClick: onClick,
    style: {
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-card)",
      overflow: "hidden",
      cursor: onClick ? "pointer" : "default",
      boxShadow: "var(--shadow-card)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: imgs.length > 1 ? "1fr 1fr" : "1fr",
      gap: 2,
      height: 130,
      background: "var(--color-surface-3)"
    }
  }, (imgs.length ? imgs : [null]).map((src, i) => src ? /*#__PURE__*/React.createElement("img", {
    key: i,
    src: src,
    alt: "",
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : /*#__PURE__*/React.createElement("div", {
    key: i
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-h4)",
      fontWeight: "var(--weight-bold)",
      color: "var(--color-text)"
    }
  }, name), typeof rating === "number" ? /*#__PURE__*/React.createElement(__ds_scope.RatingStars, {
    value: rating,
    count: reviewCount
  }) : null), meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-body-sm)",
      color: "var(--color-text-muted)"
    }
  }, meta) : null, rewardLabel ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-body-sm)",
      fontWeight: "var(--weight-bold)",
      color: "var(--color-accent)"
    }
  }, rewardLabel) : null));
}
Object.assign(__ds_scope, { RestaurantCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/menubook/RestaurantCard.jsx", error: String((e && e.message) || e) }); }

// components/menubook/RewardPill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook RewardPill — the loyalty "joy moment" anchor (golden, pill-shaped).
 * `mode="earn"` shows a points gain ("+120 pts"); `mode="redeem"` shows a
 * usable offer ("Use 100 Bites for $5 off"). It only appears when usable.
 */
function RewardPill({
  mode = "earn",
  points,
  value,
  label,
  icon = null,
  onClick,
  style,
  ...rest
}) {
  const interactive = typeof onClick === "function";
  let content = label;
  if (!content) {
    content = mode === "redeem" ? `Use ${points} Bites${value ? ` for ${value}` : ""}` : `+${points} pts`;
  }
  return /*#__PURE__*/React.createElement("span", _extends({
    role: interactive ? "button" : undefined,
    tabIndex: interactive ? 0 : undefined,
    onClick: onClick,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      height: 32,
      padding: "0 14px",
      borderRadius: "var(--radius-full)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-body-sm)",
      fontWeight: "var(--weight-bold)",
      lineHeight: 1,
      whiteSpace: "nowrap",
      cursor: interactive ? "pointer" : "default",
      color: mode === "redeem" ? "var(--color-on-reward)" : "var(--color-reward-subtle-fg)",
      background: mode === "redeem" ? "var(--color-reward)" : "var(--color-reward-subtle)",
      border: mode === "redeem" ? "1px solid transparent" : "1px solid var(--color-reward)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: "inline-flex",
      fontSize: "1.1em"
    }
  }, icon || "◆"), content);
}
Object.assign(__ds_scope, { RewardPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/menubook/RewardPill.jsx", error: String((e && e.message) || e) }); }

// components/navigation/BottomNav.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook BottomNav — the diner app's bottom tab bar. Active item uses the
 * brand green; supports an optional badge per item.
 */
function BottomNav({
  items = [],
  value,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("nav", _extends({
    style: {
      display: "flex",
      alignItems: "stretch",
      justifyContent: "space-around",
      background: "var(--color-bg-elevated)",
      borderTop: "1px solid var(--color-border)",
      padding: "8px 6px",
      ...style
    }
  }, rest), items.map(item => {
    const active = item.key === value;
    return /*#__PURE__*/React.createElement("button", {
      key: item.key,
      onClick: () => onChange && onChange(item.key),
      "aria-current": active ? "page" : undefined,
      style: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        minHeight: 48,
        padding: "4px 2px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: active ? "var(--color-primary-subtle-fg)" : "var(--color-text-subtle)",
        transition: "color var(--duration-fast) var(--ease-standard)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "relative",
        display: "inline-flex",
        fontSize: 22,
        lineHeight: 1
      }
    }, item.icon, item.badge ? /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        top: -4,
        right: -8
      }
    }, item.badge) : null), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: active ? "var(--weight-bold)" : "var(--weight-medium)"
      }
    }, item.label));
  }));
}
Object.assign(__ds_scope, { BottomNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/BottomNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Menubook Tabs — an underline tab row for in-page section switching
 * (kitchen "All Orders / Dine-in / Pickup / Delivery", dashboard sections).
 * Each tab may carry a count.
 */
function Tabs({
  items = [],
  value,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: "flex",
      gap: 4,
      borderBottom: "1px solid var(--color-border)",
      ...style
    }
  }, rest), items.map(item => {
    const key = typeof item === "string" ? item : item.key;
    const label = typeof item === "string" ? item : item.label;
    const count = typeof item === "object" ? item.count : undefined;
    const active = key === value;
    return /*#__PURE__*/React.createElement("button", {
      key: key,
      role: "tab",
      "aria-selected": active,
      onClick: () => onChange && onChange(key),
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "12px 14px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-body)",
        fontWeight: "var(--weight-bold)",
        color: active ? "var(--color-text)" : "var(--color-text-muted)",
        borderBottom: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
        marginBottom: -1,
        transition: "color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)"
      }
    }, label, typeof count === "number" ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        fontWeight: "var(--weight-bold)",
        color: active ? "var(--color-accent)" : "var(--color-text-subtle)"
      }
    }, count) : null);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/diner/BillScreen.jsx
try { (() => {
/* global React, MenubookDesignSystem_3a57e3 */
// Split bill — round items, split mode, Bites redemption, pay your share.
const BS = MenubookDesignSystem_3a57e3;
function Line({
  label,
  value,
  strong,
  muted,
  accent
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      padding: "7px 0",
      fontSize: strong ? "var(--text-body-lg)" : "var(--text-body)",
      fontWeight: strong ? 800 : 500,
      color: accent ? "var(--color-status-ready-fg)" : muted ? "var(--color-text-muted)" : "var(--color-text)"
    }
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", null, value));
}
function BillScreen({
  venue,
  cart,
  onBack,
  onPaid
}) {
  const {
    SegmentedControl,
    Button,
    RewardPill,
    Avatar
  } = BS;
  const {
    useState
  } = React;
  const [split, setSplit] = useState("Split evenly");
  const [redeem, setRedeem] = useState(false);
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const partySize = 2;
  const share = split === "Split evenly" ? subtotal / partySize : subtotal;
  const discount = redeem ? 5 : 0;
  const total = Math.max(0, share - discount);
  const earn = Math.round(total);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 200
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 20px 0",
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    "aria-label": "Back",
    style: {
      width: 40,
      height: 40,
      borderRadius: 999,
      border: "1px solid var(--color-border)",
      background: "var(--color-surface)",
      color: "var(--color-text)",
      fontSize: 20,
      cursor: "pointer"
    }
  }, "\u2039"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-h4)",
      fontWeight: 800
    }
  }, "Your bill"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-caption)",
      color: "var(--color-text-muted)"
    }
  }, "Table 12 \xB7 ", venue.name))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 20px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-card)",
      padding: "6px 16px"
    }
  }, cart.map(i => /*#__PURE__*/React.createElement(Line, {
    key: i.name,
    label: `${i.qty}× ${i.name}`,
    value: `$${(i.price * i.qty).toFixed(2)}`
  }))), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--text-h4)",
      fontWeight: 700,
      margin: "20px 0 10px"
    }
  }, "Split"), /*#__PURE__*/React.createElement(SegmentedControl, {
    tone: "surface",
    options: ["Whole table", "Split evenly", "By item"],
    value: split,
    onChange: setSplit,
    fullWidth: true,
    size: "sm"
  }), split === "Split evenly" ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
      color: "var(--color-text-muted)",
      fontSize: "var(--text-body-sm)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Alex Rivera",
    size: "sm"
  }), /*#__PURE__*/React.createElement(Avatar, {
    name: "Sam Cole",
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", null, "Split between 2 people")) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-card)",
      padding: "8px 16px"
    }
  }, /*#__PURE__*/React.createElement(Line, {
    label: "Subtotal",
    value: `$${subtotal.toFixed(2)}`,
    muted: true
  }), split === "Split evenly" ? /*#__PURE__*/React.createElement(Line, {
    label: "Your share (\xBD)",
    value: `$${share.toFixed(2)}`,
    muted: true
  }) : null, redeem ? /*#__PURE__*/React.createElement(Line, {
    label: "100 Bites reward",
    value: "\u2212$5.00",
    accent: true
  }) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--color-border)",
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(Line, {
    label: "You pay",
    value: `$${total.toFixed(2)}`,
    strong: true
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: "flex",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(RewardPill, {
    mode: "redeem",
    points: 100,
    value: "$5 off",
    icon: /*#__PURE__*/React.createElement("i", {
      className: "ph-fill ph-coins"
    }),
    onClick: () => setRedeem(r => !r),
    style: redeem ? {
      outline: "2px solid var(--color-reward)",
      outlineOffset: 2
    } : {}
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
      background: "linear-gradient(180deg, rgba(20,18,15,0), var(--color-bg) 26%)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      fontSize: "var(--text-caption)",
      color: "var(--color-text-muted)",
      marginBottom: 8
    }
  }, "You'll earn ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--color-reward-subtle-fg)"
    }
  }, earn, " Bites"), " with this order"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    fullWidth: true,
    onClick: onPaid
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("span", null, "Pay your share"), /*#__PURE__*/React.createElement("span", null, "$", total.toFixed(2))))));
}
Object.assign(window, {
  BillScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/diner/BillScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/diner/DinerApp.jsx
try { (() => {
/* global React, MenubookDesignSystem_3a57e3, PhoneFrame, DiscoverScreen, RestaurantScreen, SessionScreen, BillScreen, RewardsScreen */
// Menubook diner app — state machine wiring the screens into a click-through.
const A = MenubookDesignSystem_3a57e3;
const {
  useState,
  useMemo
} = React;
const F = "../../assets/food/";
const VENUES = [{
  id: "pasta",
  name: "Pasta e Vino",
  meta: "Italian · $$ · 0.4 km",
  rating: 4.8,
  reviewCount: 320,
  reward: "10% back in points",
  images: [F + "dish-pasta-1.jpg", F + "dish-pasta-2.jpg"],
  menu: {
    Starters: [{
      name: "Bruschetta",
      desc: "Tomato, basil, sourdough",
      price: 12.5,
      image: F + "dish-bruschetta.jpg"
    }, {
      name: "Garlic Bread",
      desc: "House focaccia",
      price: 8.5,
      image: F + "dish-garlic.jpg"
    }, {
      name: "Calamari Fritti",
      desc: "Lemon aioli",
      price: 16,
      image: F + "dish-calamari.jpg"
    }],
    Mains: [{
      name: "Spaghetti Carbonara",
      desc: "Guanciale, pecorino, egg",
      price: 24,
      image: F + "dish-carbonara.jpg"
    }, {
      name: "Margherita Pizza",
      desc: "San Marzano, fior di latte",
      price: 18,
      image: F + "dish-pasta-1.jpg"
    }, {
      name: "Risotto Funghi",
      desc: "Porcini, parmesan",
      price: 22,
      image: F + "dish-pasta-2.jpg",
      soldOut: true
    }]
  },
  dishes: [{
    name: "Spaghetti Carbonara",
    desc: "Guanciale, pecorino",
    price: 24,
    image: F + "dish-carbonara.jpg"
  }, {
    name: "Calamari Fritti",
    desc: "Lemon aioli",
    price: 16,
    image: F + "dish-calamari.jpg"
  }, {
    name: "Bruschetta",
    desc: "Tomato, basil, sourdough",
    price: 12.5,
    image: F + "dish-bruschetta.jpg"
  }]
}, {
  id: "bbq",
  name: "Sunny Side BBQ",
  meta: "BBQ · $$ · 0.6 km",
  rating: 4.6,
  reviewCount: 210,
  reward: "15% back in points",
  images: [F + "dish-bbq-1.jpg", F + "dish-bbq-2.jpg"],
  menu: {
    Starters: [{
      name: "Loaded Fries",
      desc: "Cheese, jalapeño, ranch",
      price: 11,
      image: F + "dish-bbq-1.jpg"
    }, {
      name: "Smoked Wings",
      desc: "Dry rub, house sauce",
      price: 14,
      image: F + "dish-bbq-2.jpg"
    }],
    Mains: [{
      name: "Brisket Plate",
      desc: "12hr smoke, two sides",
      price: 26,
      image: F + "dish-bbq-2.jpg"
    }, {
      name: "Pulled Pork Bun",
      desc: "Slaw, pickles",
      price: 17,
      image: F + "dish-bbq-1.jpg"
    }]
  },
  dishes: [{
    name: "Brisket Plate",
    desc: "12hr smoke, two sides",
    price: 26,
    image: F + "dish-bbq-2.jpg"
  }, {
    name: "Smoked Wings",
    desc: "Dry rub, house sauce",
    price: 14,
    image: F + "dish-bbq-2.jpg"
  }]
}];
function PlaceholderTab({
  icon,
  title,
  note
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      color: "var(--color-text-subtle)",
      padding: 40,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 44,
      color: "var(--color-text-subtle)"
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-h4)",
      fontWeight: 700,
      color: "var(--color-text)"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-body-sm)"
    }
  }, note));
}
function PaidSuccess({
  earn,
  onDone
}) {
  const {
    Button
  } = A;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "var(--color-overlay)",
      backdropFilter: "blur(6px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 28,
      zIndex: 30
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--color-bg-elevated)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-2xl)",
      padding: 28,
      textAlign: "center",
      width: "100%",
      boxShadow: "var(--shadow-lg)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: 999,
      margin: "0 auto 16px",
      background: "var(--color-primary-subtle)",
      color: "var(--color-primary-subtle-fg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 32
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-check-circle"
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "var(--text-h3)",
      fontWeight: 800,
      marginBottom: 6
    }
  }, "Payment confirmed"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--text-body-sm)",
      color: "var(--color-text-muted)",
      marginBottom: 14
    }
  }, "You saved ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--color-status-ready-fg)"
    }
  }, "$5.00"), " with 100 Bites."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      height: 34,
      padding: "0 16px",
      borderRadius: 999,
      background: "var(--gradient-reward)",
      color: "#2B2B2B",
      fontWeight: 800
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-coins"
  }), " +", earn, " Bites earned")), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    fullWidth: true,
    onClick: onDone
  }, "Done")));
}
function DinerApp() {
  const {
    BottomNav,
    Badge
  } = A;
  const [tab, setTab] = useState("discover");
  const [sub, setSub] = useState(null); // null | restaurant | session | bill | paid
  const [venueId, setVenueId] = useState("pasta");
  const [cart, setCart] = useState({});
  const venue = VENUES.find(v => v.id === venueId);
  const cartArr = useMemo(() => Object.values(cart), [cart]);
  const cartCount = cartArr.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cartArr.reduce((s, i) => s + i.price * i.qty, 0);
  const I = n => /*#__PURE__*/React.createElement("i", {
    className: "ph ph-" + n
  });
  const addToCart = d => setCart(c => ({
    ...c,
    [d.name]: {
      ...d,
      qty: (c[d.name]?.qty || 0) + 1
    }
  }));
  const reset = () => {
    setCart({});
    setSub(null);
    setTab("discover");
  };
  const showNav = sub === null;
  let body;
  if (tab === "rewards") body = /*#__PURE__*/React.createElement(RewardsScreen, null);else if (tab === "orders") body = /*#__PURE__*/React.createElement(PlaceholderTab, {
    icon: I("receipt"),
    title: "Your orders",
    note: "Past and active orders appear here."
  });else if (tab === "profile") body = /*#__PURE__*/React.createElement(PlaceholderTab, {
    icon: I("user"),
    title: "Profile",
    note: "Account, payment methods, and preferences."
  });else if (sub === "restaurant") body = /*#__PURE__*/React.createElement(RestaurantScreen, {
    venue: venue,
    onBack: () => setSub(null),
    onStartSession: () => setSub("session")
  });else if (sub === "session") body = /*#__PURE__*/React.createElement(SessionScreen, {
    venue: venue,
    cartCount: cartCount,
    cartTotal: cartTotal,
    onAdd: addToCart,
    onBack: () => setSub("restaurant"),
    onViewBill: () => setSub("bill")
  });else if (sub === "bill") body = /*#__PURE__*/React.createElement(BillScreen, {
    venue: venue,
    cart: cartArr,
    onBack: () => setSub("session"),
    onPaid: () => setSub("paid")
  });else body = /*#__PURE__*/React.createElement(DiscoverScreen, {
    venues: VENUES,
    onOpen: id => {
      setVenueId(id);
      setSub("restaurant");
    }
  });
  const nav = showNav ? /*#__PURE__*/React.createElement(BottomNav, {
    value: tab,
    onChange: t => {
      setTab(t);
      setSub(null);
    },
    items: [{
      key: "discover",
      label: "Discover",
      icon: I("compass")
    }, {
      key: "orders",
      label: "Orders",
      icon: I("receipt"),
      badge: /*#__PURE__*/React.createElement(Badge, {
        count: 1,
        tone: "accent"
      })
    }, {
      key: "rewards",
      label: "Rewards",
      icon: I("medal")
    }, {
      key: "profile",
      label: "Profile",
      icon: I("user")
    }]
  }) : null;
  return /*#__PURE__*/React.createElement(PhoneFrame, {
    bottomBar: nav
  }, body, sub === "paid" ? /*#__PURE__*/React.createElement(PaidSuccess, {
    earn: Math.round(cartTotal / 2),
    onDone: reset
  }) : null);
}
Object.assign(window, {
  DinerApp
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/diner/DinerApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/diner/DiscoverScreen.jsx
try { (() => {
/* global React, MenubookDesignSystem_3a57e3 */
// Discover screen — points balance, search, nearby favourites.
const DS = MenubookDesignSystem_3a57e3;
function SectionHead({
  title,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      margin: "22px 0 12px"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "var(--text-h3)",
      fontWeight: 700,
      color: "var(--color-text)"
    }
  }, title), action ? /*#__PURE__*/React.createElement("a", {
    style: {
      fontSize: "var(--text-body-sm)",
      fontWeight: 700,
      color: "var(--color-accent)"
    }
  }, action) : null);
}
function DiscoverScreen({
  venues,
  onOpen
}) {
  const {
    PointsBalance,
    SearchField,
    RestaurantCard,
    IconButton
  } = DS;
  const I = n => /*#__PURE__*/React.createElement("i", {
    className: "ph ph-" + n
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 20px 28px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(PointsBalance, {
    points: 1250,
    value: "$12.50"
  }), /*#__PURE__*/React.createElement(IconButton, {
    variant: "surface",
    ariaLabel: "Notifications",
    icon: I("bell")
  })), /*#__PURE__*/React.createElement(SearchField, {
    leadingIcon: I("magnifying-glass"),
    placeholder: "Search restaurants, cuisines\u2026"
  }), /*#__PURE__*/React.createElement(SectionHead, {
    title: "Nearby favourites",
    action: "See all"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, venues.map(v => /*#__PURE__*/React.createElement(RestaurantCard, {
    key: v.id,
    name: v.name,
    meta: v.meta,
    rating: v.rating,
    reviewCount: v.reviewCount,
    rewardLabel: v.reward,
    images: v.images,
    onClick: () => onOpen(v.id)
  }))));
}
Object.assign(window, {
  DiscoverScreen,
  SectionHead
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/diner/DiscoverScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/diner/PhoneFrame.jsx
try { (() => {
/* global React */
// Menubook diner app — phone frame with status bar. Warm dark theme.

function StatusBar() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 22px 4px",
      fontFamily: "var(--font-sans)",
      color: "var(--color-text)",
      fontSize: 14,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("span", null, "9:41"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center",
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-cell-signal-full"
  }), /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-wifi-high"
  }), /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-battery-full"
  })));
}
function PhoneFrame({
  children,
  bottomBar
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 390,
      height: 800,
      position: "relative",
      background: "var(--color-bg)",
      borderRadius: 44,
      border: "10px solid #000",
      boxShadow: "var(--shadow-lg)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(StatusBar, null), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      overflowX: "hidden"
    },
    className: "mb-scroll"
  }, children), bottomBar);
}
Object.assign(window, {
  PhoneFrame,
  StatusBar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/diner/PhoneFrame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/diner/RestaurantScreen.jsx
try { (() => {
/* global React, MenubookDesignSystem_3a57e3 */
// Restaurant detail — hero, meta, service options, popular dishes.
const RS = MenubookDesignSystem_3a57e3;
function QuickAction({
  icon,
  label,
  primary
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      padding: "12px 4px",
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22,
      color: primary ? "var(--color-primary-subtle-fg)" : "var(--color-text)"
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: "var(--color-text-muted)"
    }
  }, label));
}
function RestaurantScreen({
  venue,
  onBack,
  onStartSession
}) {
  const {
    RatingStars,
    SegmentedControl,
    Button,
    MenuItemRow,
    Avatar
  } = RS;
  const {
    useState
  } = React;
  const [svc, setSvc] = useState("Dine-in");
  const I = n => /*#__PURE__*/React.createElement("i", {
    className: "ph ph-" + n
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 100
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: 220
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/food/interior-hero.jpg",
    alt: "",
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "linear-gradient(180deg, rgba(20,18,15,.35) 0%, rgba(20,18,15,0) 30%, rgba(20,18,15,.55) 100%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 14,
      left: 16,
      right: 16,
      display: "flex",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    "aria-label": "Back",
    style: {
      width: 40,
      height: 40,
      borderRadius: 999,
      border: "none",
      background: "rgba(20,18,15,.5)",
      backdropFilter: "blur(8px)",
      color: "#F6F2EB",
      fontSize: 20,
      cursor: "pointer"
    }
  }, "\u2039"), /*#__PURE__*/React.createElement("button", {
    "aria-label": "Favourite",
    style: {
      width: 40,
      height: 40,
      borderRadius: 999,
      border: "none",
      background: "rgba(20,18,15,.5)",
      backdropFilter: "blur(8px)",
      color: "#F6F2EB",
      fontSize: 18,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-heart"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 20px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: -28,
      display: "flex",
      alignItems: "flex-end",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: venue.name,
    size: "lg",
    style: {
      border: "3px solid var(--color-bg)",
      background: "var(--color-surface-3)"
    }
  })), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: "var(--text-h1)",
      fontWeight: 800,
      marginTop: 12,
      color: "var(--color-text)"
    }
  }, venue.name), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--text-body-sm)",
      color: "var(--color-text-muted)",
      marginTop: 4
    }
  }, venue.meta), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(RatingStars, {
    value: venue.rating,
    count: venue.reviewCount
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-body-sm)",
      color: "var(--color-status-ready-fg)",
      fontWeight: 700
    }
  }, "Open"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-body-sm)",
      color: "var(--color-text-muted)"
    }
  }, "\xB7 Closes 10:00pm")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(QuickAction, {
    icon: I("fork-knife"),
    label: "Order",
    primary: true
  }), /*#__PURE__*/React.createElement(QuickAction, {
    icon: I("calendar-blank"),
    label: "Book"
  }), /*#__PURE__*/React.createElement(QuickAction, {
    icon: I("phone"),
    label: "Call"
  }), /*#__PURE__*/React.createElement(QuickAction, {
    icon: I("share-network"),
    label: "Share"
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "var(--text-h4)",
      fontWeight: 700,
      margin: "22px 0 10px"
    }
  }, "Service options"), /*#__PURE__*/React.createElement(SegmentedControl, {
    options: ["Dine-in", "Pickup", "Delivery"],
    value: svc,
    onChange: setSvc,
    fullWidth: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginTop: 16,
      padding: 14,
      background: "var(--color-reward-subtle)",
      border: "1px solid var(--color-reward)",
      borderRadius: "var(--radius-card)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22,
      color: "var(--color-reward)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-coins"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      color: "var(--color-text)"
    }
  }, "10% back in points"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-caption)",
      color: "var(--color-text-muted)"
    }
  }, "On all orders \xB7 Today"))), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "var(--text-h4)",
      fontWeight: 700,
      margin: "22px 0 10px"
    }
  }, "Popular dishes"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, venue.dishes.slice(0, 3).map(d => /*#__PURE__*/React.createElement(MenuItemRow, {
    key: d.name,
    name: d.name,
    description: d.desc,
    price: d.price,
    image: d.image
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
      background: "linear-gradient(180deg, rgba(20,18,15,0), var(--color-bg) 28%)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    fullWidth: true,
    onClick: onStartSession,
    iconLeft: /*#__PURE__*/React.createElement("i", {
      className: "ph ph-qr-code"
    })
  }, "Order at table")));
}
Object.assign(window, {
  RestaurantScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/diner/RestaurantScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/diner/RewardsScreen.jsx
try { (() => {
/* global React, MenubookDesignSystem_3a57e3 */
// Rewards tab — Bites balance, ways to redeem, ways to earn.
const RW = MenubookDesignSystem_3a57e3;
function RedeemRow({
  icon,
  title,
  pts,
  disabled,
  value
}) {
  const {
    Button
  } = RW;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 0",
      borderBottom: "1px solid var(--color-border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 12,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--color-reward-subtle)",
      color: "var(--color-reward-subtle-fg)",
      fontSize: 20,
      flex: "0 0 auto"
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      color: "var(--color-text)"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-caption)",
      color: "var(--color-text-muted)"
    }
  }, pts, " pts", value ? ` · ${value}` : "")), /*#__PURE__*/React.createElement(Button, {
    variant: disabled ? "ghost" : "secondary",
    size: "sm",
    disabled: disabled
  }, disabled ? "Locked" : "Redeem"));
}
function RewardsScreen() {
  const I = n => /*#__PURE__*/React.createElement("i", {
    className: "ph ph-" + n
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 20px 28px"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: "var(--text-h2)",
      fontWeight: 800,
      marginBottom: 16
    }
  }, "Your rewards"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      overflow: "hidden",
      borderRadius: "var(--radius-lg)",
      padding: "22px 20px",
      background: "var(--gradient-reward)",
      color: "#2B2B2B"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-body-sm)",
      fontWeight: 700,
      opacity: .8
    }
  }, "Bites balance"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 8,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 40,
      fontWeight: 900,
      letterSpacing: "-0.03em",
      lineHeight: 1
    }
  }, "1,250"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 800
    }
  }, "pts")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-caption)",
      fontWeight: 600,
      marginTop: 4
    }
  }, "$12.50 value \xB7 66 until your next $5"), /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-gift",
    style: {
      position: "absolute",
      right: -6,
      bottom: -10,
      fontSize: 96,
      opacity: .22
    }
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "var(--text-h4)",
      fontWeight: 700,
      margin: "22px 0 4px"
    }
  }, "Ways to redeem"), /*#__PURE__*/React.createElement(RedeemRow, {
    icon: I("tag"),
    title: "$5 off your order",
    pts: "500",
    value: "$5"
  }), /*#__PURE__*/React.createElement(RedeemRow, {
    icon: I("coffee"),
    title: "Free coffee",
    pts: "300"
  }), /*#__PURE__*/React.createElement(RedeemRow, {
    icon: I("cake"),
    title: "Free dessert",
    pts: "800",
    disabled: true
  }), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "var(--text-h4)",
      fontWeight: 700,
      margin: "22px 0 4px"
    }
  }, "Earn more"), /*#__PURE__*/React.createElement(RedeemRow, {
    icon: I("user-plus"),
    title: "Invite a friend",
    pts: "+250",
    value: "when they order"
  }), /*#__PURE__*/React.createElement(RedeemRow, {
    icon: I("star"),
    title: "Leave a review",
    pts: "+10",
    value: "per order"
  }));
}
Object.assign(window, {
  RewardsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/diner/RewardsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/diner/SessionScreen.jsx
try { (() => {
/* global React, MenubookDesignSystem_3a57e3 */
// Dine-in QR session — table menu with add-to-round + sticky cart bar.
const SS = MenubookDesignSystem_3a57e3;
function SessionScreen({
  venue,
  cartCount,
  cartTotal,
  onAdd,
  onBack,
  onViewBill
}) {
  const {
    SegmentedControl,
    MenuItemRow,
    Button
  } = SS;
  const {
    useState
  } = React;
  const [tab, setTab] = useState("Menu");
  const I = n => /*#__PURE__*/React.createElement("i", {
    className: "ph ph-" + n
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 90
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 20px 0",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    "aria-label": "Back",
    style: {
      width: 40,
      height: 40,
      borderRadius: 999,
      border: "1px solid var(--color-border)",
      background: "var(--color-surface)",
      color: "var(--color-text)",
      fontSize: 20,
      cursor: "pointer"
    }
  }, "\u2039"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-h4)",
      fontWeight: 800,
      color: "var(--color-text)"
    }
  }, "Table 12"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-caption)",
      color: "var(--color-text-muted)"
    }
  }, venue.name)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 999,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--color-text)",
      fontSize: 18
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-heart"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 20px 4px"
    }
  }, /*#__PURE__*/React.createElement(SegmentedControl, {
    tone: "surface",
    options: ["Menu", "Drinks", "Desserts"],
    value: tab,
    onChange: setTab,
    fullWidth: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 20px"
    }
  }, Object.entries(venue.menu).map(([section, items]) => /*#__PURE__*/React.createElement("div", {
    key: section
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--text-h4)",
      fontWeight: 700,
      margin: "18px 0 10px",
      color: "var(--color-text)"
    }
  }, section), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, items.map(d => /*#__PURE__*/React.createElement(MenuItemRow, {
    key: d.name,
    name: d.name,
    description: d.desc,
    price: d.price,
    image: d.image,
    soldOut: d.soldOut,
    onAdd: () => onAdd(d)
  })))))), cartCount > 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
      background: "linear-gradient(180deg, rgba(20,18,15,0), var(--color-bg) 30%)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    fullWidth: true,
    onClick: onViewBill,
    iconLeft: /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 24,
        height: 24,
        borderRadius: 999,
        background: "rgba(255,255,255,.18)",
        fontSize: 13
      }
    }, cartCount)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      width: "100%",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", null, "View your cart"), /*#__PURE__*/React.createElement("span", null, "$", cartTotal.toFixed(2))))) : null);
}
Object.assign(window, {
  SessionScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/diner/SessionScreen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.RatingStars = __ds_scope.RatingStars;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.SearchField = __ds_scope.SearchField;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.MenuItemRow = __ds_scope.MenuItemRow;

__ds_ns.PointsBalance = __ds_scope.PointsBalance;

__ds_ns.RestaurantCard = __ds_scope.RestaurantCard;

__ds_ns.RewardPill = __ds_scope.RewardPill;

__ds_ns.BottomNav = __ds_scope.BottomNav;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
