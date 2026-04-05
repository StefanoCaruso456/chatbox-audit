import { type RemoteConfig, Theme } from '@shared/types'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import Toasts from '@/components/common/Toasts'
import ExitFullscreenButton from '@/components/layout/ExitFullscreenButton'
import useAppTheme from '@/hooks/useAppTheme'
import { useSystemLanguageWhenInit } from '@/hooks/useDefaultSystemLanguage'
import { useI18nEffect } from '@/hooks/useI18nEffect'
import useNeedRoomForWinControls from '@/hooks/useNeedRoomForWinControls'
import { useSidebarWidth } from '@/hooks/useScreenChange'
import useShortcut from '@/hooks/useShortcut'
import '@/modals'
import NiceModal from '@ebay/nice-modal-react'
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Combobox,
  colorsTuple,
  createTheme,
  type DefaultMantineColor,
  Drawer,
  Input,
  type MantineColorsTuple,
  MantineProvider,
  Menu,
  Modal,
  NativeSelect,
  NavLink,
  Paper,
  Popover,
  rem,
  Select,
  Slider,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core'
import { Box, Grid } from '@mui/material'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router'
import { useSetAtom } from 'jotai'
import { useEffect, useMemo, useRef } from 'react'
import AppsModal from '@/components/apps/AppsModal'
import { isEmbeddedAppPath } from '@/lib/root-layout-utils'
import SettingsModal, { navigateToSettings } from '@/modals/Settings'
import { getOS } from '@/packages/navigator'
import * as remote from '@/packages/remote'
import PictureDialog from '@/pages/PictureDialog'
import RemoteDialogWindow from '@/pages/RemoteDialogWindow'
import SearchDialog from '@/pages/SearchDialog'
import platform from '@/platform'
import { router } from '@/router'
import Sidebar from '@/Sidebar'
import * as atoms from '@/stores/atoms'
import * as premiumActions from '@/stores/premiumActions'
import * as settingActions from '@/stores/settingActions'
import { settingsStore, useLanguage, useSettingsStore, useTheme } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'

const neumorphicTransition = '160ms ease'

const raisedSurfaceStyles = {
  background: 'var(--chatbox-surface-elevated)',
  border: '1px solid color-mix(in srgb, var(--chatbox-border-primary), transparent 10%)',
  boxShadow: 'var(--chatbox-shadow-raised-sm)',
}

const insetSurfaceStyles = {
  background: 'var(--chatbox-surface-inset)',
  border: '1px solid color-mix(in srgb, var(--chatbox-border-primary), transparent 4%)',
  boxShadow: 'var(--chatbox-shadow-inset)',
}

function Root() {
  const location = useLocation()
  const spellCheck = useSettingsStore((state) => state.spellCheck)
  const language = useLanguage()
  const initialized = useRef(false)
  const isEmbeddedAppRoute = isEmbeddedAppPath(location.pathname)

  const setOpenAboutDialog = useUIStore((s) => s.setOpenAboutDialog)

  const setRemoteConfig = useSetAtom(atoms.remoteConfigAtom)

  useEffect(() => {
    if (isEmbeddedAppRoute) {
      return
    }
    if (initialized.current) {
      return
    }
    // 通过定时器延迟启动，防止处理状态底层存储的异步加载前错误的初始数据
    const tid = setTimeout(() => {
      // biome-ignore lint/nursery/noFloatingPromises: inline call
      ;(async () => {
        const remoteConfig = await remote
          .getRemoteConfig('setting_chatboxai_first')
          .catch(() => ({ setting_chatboxai_first: false }) as RemoteConfig)
        setRemoteConfig((conf) => ({ ...conf, ...remoteConfig }))
        // 是否需要弹出设置窗口
        initialized.current = true
        if (settingActions.needEditSetting() && location.pathname !== '/settings/mcp') {
          await NiceModal.show('welcome')
          return
        }
        // 是否需要弹出关于窗口（更新后首次启动）
        // 目前仅在桌面版本更新后首次启动、且网络环境为"外网"的情况下才自动弹窗
        const shouldShowAboutDialogWhenStartUp = await platform.shouldShowAboutDialogWhenStartUp()
        if (shouldShowAboutDialogWhenStartUp && remoteConfig.setting_chatboxai_first) {
          setOpenAboutDialog(true)
          return
        }
      })()
    }, 2000)

    return () => clearTimeout(tid)
  }, [isEmbeddedAppRoute, setOpenAboutDialog, setRemoteConfig, location.pathname])

  const showSidebar = useUIStore((s) => s.showSidebar)
  const sidebarWidth = useSidebarWidth()

  const _theme = useTheme()
  const { setColorScheme } = useMantineColorScheme()
  // biome-ignore lint/correctness/useExhaustiveDependencies: setColorScheme is stable
  useEffect(() => {
    if (_theme === Theme.Dark) {
      setColorScheme('dark')
    } else if (_theme === Theme.Light) {
      setColorScheme('light')
    } else {
      setColorScheme('auto')
    }
  }, [_theme])

  useEffect(() => {
    if (isEmbeddedAppRoute) {
      return
    }
    ;(() => {
      const { startupPage } = settingsStore.getState()
      const sid = JSON.parse(localStorage.getItem('_currentSessionIdCachedAtom') || '""') as string
      if (sid && startupPage === 'session') {
        router.navigate({
          to: `/session/${sid}`,
          replace: true,
        })
      }
    })()
  }, [isEmbeddedAppRoute])

  useEffect(() => {
    if (platform.capabilities.navigationEvents && platform.onNavigate) {
      // 移动端和其他平台的导航监听器
      return platform.onNavigate((path) => {
        // 如果是 settings 路径，使用 navigateToSettings 以保持与主页面设置按钮一致的行为
        // 在桌面端会打开 Modal，在移动端会正常导航
        if (path.startsWith('/settings')) {
          // 提取 settings 之后的路径部分（包含查询参数）
          const settingsPath = path.substring('/settings'.length)
          navigateToSettings(settingsPath || '/')
        } else {
          router.navigate({ to: path })
        }
      })
    }
  }, [])

  const { needRoomForMacWindowControls } = useNeedRoomForWinControls()
  useEffect(() => {
    if (needRoomForMacWindowControls) {
      document.documentElement.setAttribute('data-need-room-for-mac-controls', 'true')
    } else {
      document.documentElement.removeAttribute('data-need-room-for-mac-controls')
    }
  }, [needRoomForMacWindowControls])

  return (
    <Box className="box-border App cb-neumo-app" spellCheck={spellCheck} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {platform.type === 'desktop' && (getOS() === 'Windows' || getOS() === 'Linux') && <ExitFullscreenButton />}
      <Grid container className="h-full">
        {!isEmbeddedAppRoute && <Sidebar />}
        <Box
          className="h-full w-full"
          sx={{
            flexGrow: 1,
            ...(!isEmbeddedAppRoute && showSidebar
              ? language === 'ar'
                ? { paddingRight: { sm: `${sidebarWidth}px` } }
                : { paddingLeft: { sm: `${sidebarWidth}px` } }
              : {}),
          }}
        >
          <ErrorBoundary name="main">
            <Outlet />
          </ErrorBoundary>
        </Box>
      </Grid>
      {/* 对话设置 */}
      {/* <AppStoreRatingDialog /> */}
      {/* 代码预览 */}
      {/* <ArtifactDialog /> */}
      {/* 对话列表清理 */}
      {/* <ChatConfigWindow /> */}
      {/* 似乎未使用 */}
      {/* <CleanWidnow /> */}
      {/* 对话列表清理 */}
      {/* <ClearConversationListWindow /> */}
      {/* 导出聊天记录 */}
      {/* <ExportChatDialog /> */}
      {/* 编辑消息 */}
      {/* <MessageEditDialog /> */}
      {/* 添加链接 */}
      {/* <OpenAttachLinkDialog /> */}
      {/* 图片预览 */}
      <PictureDialog />
      {/* 似乎是从后端拉一个弹窗的配置 */}
      <RemoteDialogWindow />
      {/* 手机端举报内容 */}
      {/* <ReportContentDialog /> */}
      {/* 搜索 */}
      <SearchDialog />
      <AppsModal />
      {/* 没有配置模型时的欢迎弹窗 */}
      {/* <WelcomeDialog /> */}
      <Toasts /> {/* mui */}
      <SettingsModal />
    </Box>
  )
}

const creteMantineTheme = (scale = 1) =>
  createTheme({
    /** Put your mantine theme override here */
    scale,
    primaryColor: 'chatbox-brand',
    fontFamily: 'Cairo, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    colors: {
      'chatbox-brand': colorsTuple(Array.from({ length: 10 }, () => 'var(--chatbox-tint-brand)')),
      'chatbox-gray': colorsTuple(Array.from({ length: 10 }, () => 'var(--chatbox-tint-gray)')),
      'chatbox-success': colorsTuple(Array.from({ length: 10 }, () => 'var(--chatbox-tint-success)')),
      'chatbox-error': colorsTuple(Array.from({ length: 10 }, () => 'var(--chatbox-tint-error)')),
      'chatbox-warning': colorsTuple(Array.from({ length: 10 }, () => 'var(--chatbox-tint-warning)')),

      'chatbox-primary': colorsTuple(Array.from({ length: 10 }, () => 'var(--chatbox-tint-primary)')),
      'chatbox-secondary': colorsTuple(Array.from({ length: 10 }, () => 'var(--chatbox-tint-secondary)')),
      'chatbox-tertiary': colorsTuple(Array.from({ length: 10 }, () => 'var(--chatbox-tint-tertiary)')),
    },
    headings: {
      fontFamily: 'Cairo, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontWeight: 'Bold',
      sizes: {
        h1: {
          fontSize: 'calc(2.5rem * var(--mantine-scale))', // 40px
          lineHeight: '1.2', // 48px
        },
        h2: {
          fontSize: 'calc(2rem * var(--mantine-scale))', // 32px
          lineHeight: '1.25', //  40px
        },
        h3: {
          fontSize: 'calc(1.5rem * var(--mantine-scale))', // 24px
          lineHeight: '1.3333333333', // 32px
        },
        h4: {
          fontSize: 'calc(1.125rem * var(--mantine-scale))', // 18px
          lineHeight: '1.3333333333', // 24px
        },
        h5: {
          fontSize: 'calc(1rem * var(--mantine-scale))', // 16px
          lineHeight: '1.25', // 20px
        },
        h6: {
          fontSize: 'calc(0.75rem * var(--mantine-scale))', // 12px
          lineHeight: '1.3333333333', // 16px
        },
      },
    },
    fontSizes: {
      xxs: 'calc(0.625rem * var(--mantine-scale))', // 10px
      xs: 'calc(0.75rem * var(--mantine-scale))', // 12px
      sm: 'calc(0.875rem * var(--mantine-scale))', // 14px
      md: 'calc(1rem * var(--mantine-scale))', // 16px
      lg: 'calc(1.125rem * var(--mantine-scale))', // 18px
      xl: 'calc(1.25rem * var(--mantine-scale))', // 20px
    },
    lineHeights: {
      xxs: '1.3', // 13px
      xs: '1.3333333333', // 16px
      sm: '1.4285714286', // 20px
      md: '1.5', // 24px
      lg: '1.5555555556', // 28px
      xl: '1.6', // 32px
    },
    radius: {
      xs: 'calc(0.125rem * var(--mantine-scale))',
      sm: 'calc(0.25rem * var(--mantine-scale))',
      md: 'calc(0.5rem * var(--mantine-scale))',
      lg: 'calc(1rem * var(--mantine-scale))',
      xl: 'calc(1.5rem * var(--mantine-scale))',
      xxl: 'calc(2rem * var(--mantine-scale))',
    },
    spacing: {
      '3xs': 'calc(0.125rem * var(--mantine-scale))',
      xxs: 'calc(0.25rem * var(--mantine-scale))',
      xs: 'calc(0.5rem * var(--mantine-scale))',
      sm: 'calc(0.75rem * var(--mantine-scale))',
      md: 'calc(1rem * var(--mantine-scale))',
      lg: 'calc(1.25rem * var(--mantine-scale))',
      xl: 'calc(1.5rem * var(--mantine-scale))',
      xxl: 'calc(2rem * var(--mantine-scale))',
    },
    components: {
      Text: Text.extend({
        defaultProps: {
          size: 'sm',
          c: 'chatbox-primary',
        },
      }),
      Title: Title.extend({
        defaultProps: {
          c: 'chatbox-primary',
        },
      }),
      ActionIcon: ActionIcon.extend({
        defaultProps: {
          radius: 'xl',
          variant: 'subtle',
        },
        styles: (_theme, props) => {
          const isFilled = props.variant === 'filled'
          const isTransparent = props.variant === 'transparent'

          return {
            root: {
              transition: `transform ${neumorphicTransition}, box-shadow ${neumorphicTransition}, background-color ${neumorphicTransition}, color ${neumorphicTransition}, border-color ${neumorphicTransition}`,
              border: isTransparent
                ? 'none'
                : '1px solid color-mix(in srgb, var(--chatbox-border-primary), transparent 10%)',
              background: isTransparent
                ? 'transparent'
                : isFilled
                  ? 'linear-gradient(145deg, color-mix(in srgb, var(--chatbox-background-brand-primary), white 16%), var(--chatbox-background-brand-primary))'
                  : 'var(--chatbox-surface-elevated)',
              boxShadow: isTransparent
                ? 'none'
                : isFilled
                  ? '0 14px 28px rgba(45, 127, 249, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  : 'var(--chatbox-shadow-raised-sm)',
              color: isFilled ? 'var(--chatbox-tint-white)' : 'var(--chatbox-tint-secondary)',
              '&:hover': {
                background: isTransparent
                  ? 'color-mix(in srgb, var(--chatbox-background-gray-secondary), transparent 8%)'
                  : isFilled
                    ? 'linear-gradient(145deg, color-mix(in srgb, var(--chatbox-background-brand-primary-hover), white 12%), var(--chatbox-background-brand-primary-hover))'
                    : 'var(--chatbox-surface-elevated-hover)',
                color: isFilled ? 'var(--chatbox-tint-white)' : 'var(--chatbox-tint-primary)',
                borderColor: isTransparent ? 'transparent' : 'var(--chatbox-border-brand)',
              },
              '&:active': {
                transform: 'translateY(1px)',
                boxShadow: isTransparent ? 'none' : 'var(--chatbox-shadow-inset)',
              },
              '&:focus-visible': {
                outline: 'none',
                boxShadow: `${isTransparent ? '0 0 0 0 transparent' : 'var(--chatbox-shadow-raised-sm)'}, var(--chatbox-shadow-focus)`,
              },
              '&[data-disabled], &:disabled': {
                opacity: 0.58,
                color: 'var(--chatbox-tint-disabled)',
                background: isTransparent ? 'transparent' : 'var(--chatbox-background-disabled)',
                boxShadow: 'none',
                borderColor: 'color-mix(in srgb, var(--chatbox-border-primary), transparent 18%)',
              },
            },
          }
        },
      }),
      Button: Button.extend({
        defaultProps: {
          color: 'chatbox-brand',
        },
        styles: (_theme, props) => {
          const isFilled = props.variant === 'filled' || !props.variant
          const isSubtle = props.variant === 'subtle'
          const usesRaisedSurface = !isSubtle && !isFilled

          return {
            root: {
              '--button-height-sm': rem('36px'),
              '--button-height-compact-xs': rem('28px'),
              fontWeight: '600',
              borderRadius: 'calc(1rem * var(--mantine-scale))',
              transition: `transform ${neumorphicTransition}, box-shadow ${neumorphicTransition}, background-color ${neumorphicTransition}, color ${neumorphicTransition}, border-color ${neumorphicTransition}`,
              border: isSubtle
                ? '1px solid transparent'
                : '1px solid color-mix(in srgb, var(--chatbox-border-primary), transparent 8%)',
              background: isFilled
                ? 'linear-gradient(145deg, color-mix(in srgb, var(--chatbox-background-brand-primary), white 16%), var(--chatbox-background-brand-primary))'
                : isSubtle
                  ? 'transparent'
                  : 'var(--chatbox-surface-elevated)',
              boxShadow: isFilled
                ? '0 18px 30px rgba(45, 127, 249, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.18)'
                : isSubtle
                  ? 'none'
                  : 'var(--chatbox-shadow-raised-sm)',
              color: isFilled
                ? 'var(--chatbox-tint-white)'
                : props.color === 'chatbox-secondary'
                  ? 'var(--chatbox-tint-secondary)'
                  : 'var(--chatbox-tint-primary)',
              '&:hover': {
                background: isFilled
                  ? 'linear-gradient(145deg, color-mix(in srgb, var(--chatbox-background-brand-primary-hover), white 12%), var(--chatbox-background-brand-primary-hover))'
                  : isSubtle
                    ? 'color-mix(in srgb, var(--chatbox-background-gray-secondary), transparent 8%)'
                    : 'var(--chatbox-surface-elevated-hover)',
                borderColor: isSubtle ? 'transparent' : 'var(--chatbox-border-brand)',
                color: isFilled ? 'var(--chatbox-tint-white)' : 'var(--chatbox-tint-primary)',
              },
              '&:active': {
                transform: 'translateY(1px)',
                boxShadow: isSubtle ? 'none' : 'var(--chatbox-shadow-inset)',
              },
              '&:focus-visible': {
                outline: 'none',
                boxShadow: `${usesRaisedSurface ? 'var(--chatbox-shadow-raised-sm), ' : ''}var(--chatbox-shadow-focus)`,
              },
              '&[data-disabled], &:disabled': {
                opacity: 0.62,
                background: 'var(--chatbox-background-disabled)',
                color: 'var(--chatbox-tint-disabled)',
                borderColor: 'color-mix(in srgb, var(--chatbox-border-primary), transparent 18%)',
                boxShadow: 'none',
              },
            },
            label: {
              fontWeight: 600,
            },
          }
        },
      }),
      Input: Input.extend({
        styles: (_theme, props) => ({
          wrapper: {
            '--input-height-sm': rem('36px'),
          },
          input: {
            ...insetSurfaceStyles,
            minHeight: rem('36px'),
            color: props.error ? 'var(--chatbox-tint-error)' : 'var(--chatbox-tint-primary)',
            transition: `border-color ${neumorphicTransition}, box-shadow ${neumorphicTransition}, background-color ${neumorphicTransition}, color ${neumorphicTransition}`,
            '&::placeholder': {
              color: 'var(--chatbox-tint-placeholder)',
            },
            '&:focus, &:focus-within': {
              borderColor: props.error ? 'var(--chatbox-tint-error)' : 'var(--chatbox-border-brand)',
              boxShadow: `var(--chatbox-shadow-inset), ${props.error ? '0 0 0 3px rgba(229, 82, 82, 0.16)' : 'var(--chatbox-shadow-focus)'}`,
            },
          },
          section: {
            color: 'var(--chatbox-tint-tertiary)',
          },
        }),
      }),
      TextInput: TextInput.extend({
        defaultProps: {
          size: 'sm',
        },
        styles: () => ({
          label: {
            marginBottom: 'var(--chatbox-spacing-xxs)',
            fontWeight: '600',
            lineHeight: '1.5',
          },
          description: {
            color: 'var(--chatbox-tint-tertiary)',
          },
          error: {
            color: 'var(--chatbox-tint-error)',
          },
        }),
      }),
      Textarea: Textarea.extend({
        defaultProps: {
          size: 'sm',
        },
        styles: () => ({
          label: {
            marginBottom: 'var(--chatbox-spacing-xxs)',
            fontWeight: '600',
            lineHeight: '1.5',
          },
          description: {
            color: 'var(--chatbox-tint-tertiary)',
          },
          error: {
            color: 'var(--chatbox-tint-error)',
          },
        }),
      }),
      Select: Select.extend({
        defaultProps: {
          size: 'sm',
          allowDeselect: false,
        },
        styles: () => ({
          label: {
            marginBottom: 'var(--chatbox-spacing-xxs)',
            fontWeight: '600',
            lineHeight: '1.5',
          },
          dropdown: {
            ...raisedSurfaceStyles,
            padding: rem('6px'),
            borderRadius: rem('18px'),
          },
          option: {
            borderRadius: rem('12px'),
            color: 'var(--chatbox-tint-primary)',
            '&[data-combobox-selected]': {
              background: 'var(--chatbox-background-brand-secondary)',
              color: 'var(--chatbox-tint-brand)',
            },
          },
        }),
      }),
      NativeSelect: NativeSelect.extend({
        defaultProps: {
          size: 'sm',
        },
        styles: () => ({
          label: {
            marginBottom: 'var(--chatbox-spacing-xxs)',
            fontWeight: '600',
            lineHeight: '1.5',
          },
        }),
      }),
      Switch: Switch.extend({
        defaultProps: {
          size: 'sm',
        },
        styles: (_theme, props) => {
          return {
            label: {
              color: props.checked ? 'var(--chatbox-tint-primary)' : 'var(--chatbox-tint-tertiary)',
            },
          }
        },
      }),
      Checkbox: Checkbox.extend({
        defaultProps: {
          size: 'sm',
        },
        styles: (_theme, props) => ({
          label: {
            color: props.checked ? 'var(--chatbox-tint-primary)' : 'var(--chatbox-tint-tertiary)',
          },
        }),
      }),
      Modal: Modal.extend({
        defaultProps: {
          zIndex: 2000,
        },
        styles: () => ({
          header: {
            background: 'transparent',
          },
          body: {
            background: 'transparent',
          },
          title: {
            fontWeight: '600',
            color: 'var(--chatbox-tint-primary)',
            fontSize: 'var(--mantine-font-size-sm)',
          },
          close: {
            width: rem('24px'),
            height: rem('24px'),
            color: 'var(--chatbox-tint-secondary)',
          },
          content: {
            ...raisedSurfaceStyles,
            borderRadius: rem('28px'),
            boxShadow: 'var(--chatbox-shadow-floating)',
          },
          overlay: {
            '--overlay-bg': 'var(--chatbox-background-mask-overlay)',
          },
        }),
      }),
      Drawer: Drawer.extend({
        defaultProps: {
          zIndex: 2000,
        },
        styles: () => ({
          header: {
            background: 'transparent',
          },
          body: {
            background: 'transparent',
          },
          title: {
            fontWeight: '600',
            color: 'var(--chatbox-tint-primary)',
            fontSize: 'var(--mantine-font-size-sm)',
          },
          close: {
            width: rem('24px'),
            height: rem('24px'),
            color: 'var(--chatbox-tint-secondary)',
          },
          content: {
            ...raisedSurfaceStyles,
            borderRadius: rem('28px'),
            boxShadow: 'var(--chatbox-shadow-floating)',
          },
          overlay: {
            '--overlay-bg': 'var(--chatbox-background-mask-overlay)',
          },
        }),
      }),
      Combobox: Combobox.extend({
        defaultProps: {
          shadow: 'md',
          zIndex: 2100,
        },
      }),
      Menu: Menu.extend({
        defaultProps: {
          shadow: 'md',
          zIndex: 2100,
        },
        styles: () => ({
          dropdown: {
            ...raisedSurfaceStyles,
            padding: rem('6px'),
            borderRadius: rem('18px'),
          },
          item: {
            borderRadius: rem('12px'),
            color: 'var(--chatbox-tint-primary)',
            transition: `background-color ${neumorphicTransition}, color ${neumorphicTransition}`,
            '&[data-hovered]': {
              background: 'var(--chatbox-background-gray-secondary)',
              color: 'var(--chatbox-tint-primary)',
            },
          },
          divider: {
            borderColor: 'var(--chatbox-divider)',
          },
          label: {
            color: 'var(--chatbox-tint-tertiary)',
          },
        }),
      }),
      Paper: Paper.extend({
        styles: () => ({
          root: {
            ...raisedSurfaceStyles,
          },
        }),
      }),
      NavLink: NavLink.extend({
        defaultProps: {
          variant: 'light',
        },
        styles: () => ({
          root: {
            borderRadius: rem('18px'),
            paddingInline: rem('12px'),
            paddingBlock: rem('10px'),
            transition: `background-color ${neumorphicTransition}, box-shadow ${neumorphicTransition}, color ${neumorphicTransition}, transform ${neumorphicTransition}`,
            '&:hover': {
              background: 'var(--chatbox-background-gray-secondary)',
              boxShadow: 'var(--chatbox-shadow-raised-sm)',
            },
            '&[data-active]': {
              background: 'var(--chatbox-background-brand-secondary)',
              boxShadow: 'var(--chatbox-shadow-raised-sm)',
            },
          },
          label: {
            fontWeight: 600,
          },
          description: {
            color: 'var(--chatbox-tint-tertiary)',
          },
          section: {
            color: 'inherit',
          },
        }),
      }),
      Badge: Badge.extend({
        styles: (_theme, props) => ({
          root: {
            borderRadius: rem('999px'),
            border:
              props.variant === 'outline'
                ? '1px solid color-mix(in srgb, currentColor, transparent 60%)'
                : '1px solid color-mix(in srgb, var(--chatbox-border-primary), transparent 18%)',
            background: props.variant === 'outline' ? 'transparent' : 'var(--chatbox-surface-soft)',
            boxShadow: props.variant === 'outline' ? 'none' : 'var(--chatbox-shadow-raised-sm)',
          },
          label: {
            fontWeight: 700,
            letterSpacing: '0.02em',
          },
        }),
      }),
      Avatar: Avatar.extend({
        styles: () => ({
          root: {
            border: '1px solid color-mix(in srgb, var(--chatbox-border-primary), transparent 14%)',
            boxShadow: 'var(--chatbox-shadow-raised-sm)',
          },
          image: {
            objectFit: 'contain',
          },
          placeholder: {
            background: 'var(--chatbox-surface-elevated)',
            color: 'var(--chatbox-tint-brand)',
          },
        }),
      }),
      Tooltip: Tooltip.extend({
        defaultProps: {
          zIndex: 3000,
        },
      }),
      Popover: Popover.extend({
        defaultProps: {
          zIndex: 3000,
        },
        styles: () => ({
          dropdown: {
            ...raisedSurfaceStyles,
            borderRadius: rem('18px'),
            boxShadow: 'var(--chatbox-shadow-floating)',
          },
        }),
      }),
      Slider: Slider.extend({
        classNames: {
          trackContainer: 'max-sm:pointer-events-none',
          thumb: 'max-sm:pointer-events-auto',
        },
      }),
    },
  })

export const Route = createRootRoute({
  component: () => {
    useI18nEffect()
    premiumActions.useAutoValidate() // 每次启动都执行 license 检查，防止用户在lemonsqueezy管理页面中取消了当前设备的激活
    useSystemLanguageWhenInit()
    useShortcut()
    const theme = useAppTheme()
    const _theme = useTheme()
    const fontSize = useSettingsStore((state) => state.fontSize)
    const scale = fontSize / 14
    const mantineTheme = useMemo(() => creteMantineTheme(scale), [scale])

    return (
      <MantineProvider
        theme={mantineTheme}
        defaultColorScheme={_theme === Theme.Dark ? 'dark' : _theme === Theme.Light ? 'light' : 'auto'}
      >
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <NiceModal.Provider>
            <ErrorBoundary>
              <Root />
            </ErrorBoundary>
          </NiceModal.Provider>
        </ThemeProvider>
      </MantineProvider>
    )
  },
})

type ExtendedCustomColors =
  | 'chatbox-brand'
  | 'chatbox-gray'
  | 'chatbox-success'
  | 'chatbox-error'
  | 'chatbox-warning'
  | 'chatbox-primary'
  | 'chatbox-secondary'
  | 'chatbox-tertiary'
  | DefaultMantineColor

declare module '@mantine/core' {
  export interface MantineThemeColorsOverride {
    colors: Record<ExtendedCustomColors, MantineColorsTuple>
  }
}
