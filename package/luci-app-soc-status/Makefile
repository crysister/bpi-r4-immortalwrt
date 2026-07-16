include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-soc-status
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0

LUCI_TITLE:=LuCI MT7988 SoC Status Dashboard (CPU, HNAT, Thermal, Fan)
LUCI_DEPENDS:=+luci-base +luci-compat
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# NOTE: Translation (.lmo) must be pre-built into root/ before compile.
# Run: po2lmo po/zh_Hans/soc-status.po root/usr/lib/lua/luci/i18n/soc-status.zh-cn.lmo
# The rebuild script handles this automatically.

# call BuildPackage - OpenWrt buildroot signature
